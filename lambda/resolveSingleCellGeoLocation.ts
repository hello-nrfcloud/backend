import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { SSMClient } from '@aws-sdk/client-ssm'
import { Context, SingleCellGeoLocation } from '@hello.nrfcloud.com/proto/hello'
import { proto } from '@hello.nrfcloud.com/proto/hello/model/PCA20035+solar'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { type Static } from '@sinclair/typebox'
import { once } from 'lodash-es'
import { get, store } from '../cellGeoLocation/SingleCellGeoLocationCache.js'
import { cellId } from '../cellGeoLocation/cellId.js'
import { getAllAccountsSettings } from '../nrfcloud/allAccounts.js'
import { JSONPayload, validatedFetch } from '../nrfcloud/validatedFetch.js'
import { getDeviceAttributesById } from './getDeviceAttributes.js'
import { loggingFetch } from './loggingFetch.js'
import { metricsForComponent } from './metrics/metrics.js'
import { GroundFix } from './nrfcloud/groundFix.js'
import { serviceToken } from './nrfcloud/serviceToken.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from './util/logger.js'

const { EventBusName, stackName, DevicesTableName, cacheTableName } = fromEnv({
	EventBusName: 'EVENTBUS_NAME',
	stackName: 'STACK_NAME',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	cacheTableName: 'CACHE_TABLE_NAME',
})(process.env)

export const log = logger('singleCellGeo')
const eventBus = new EventBridge({})
const db = new DynamoDBClient({})
const ssm = new SSMClient({})

const deviceFetcher = getDeviceAttributesById({ db, DevicesTableName })

const { track, metrics } = metricsForComponent('singleCellGeo')

export const trackFetch = loggingFetch({ track, log })

const getCached = get({
	db,
	TableName: cacheTableName,
})
const cache = store({
	db,
	TableName: cacheTableName,
})

const allAccountsSettings = once(getAllAccountsSettings({ ssm, stackName }))
const fetchToken = serviceToken(trackFetch, (error) => {
	log.error(`Acquiring service token failed`, {
		error,
	})
})

/**
 * Handle configure device request
 */
const h = async (event: {
	message: {
		appId: 'DEVICE'
		messageType: 'DATA'
		ts: number
		data: {
			networkInfo: {
				currentBand: number // e.g. 20
				networkMode: string // e.g. 'LTE-M'
				rsrp: number // e.g. -102
				areaCode: number // e.g. 2305
				mccmnc: number // e.g. 24202
				cellID: number // e.g. 34237196
				ipAddress: string // e.g. '100.74.127.55'
				eest: number // e.g. 7
			}
		}
	}
	deviceId: string
	timestamp: number
}): Promise<void> => {
	log.info('event', { event })
	const { deviceId } = event
	const { model, account } = await deviceFetcher(deviceId)
	const settings = (await allAccountsSettings())[account]
	if (settings === undefined) {
		throw new Error(`nRF Cloud settings(${account}) are not configured`)
	}

	const { apiEndpoint, apiKey } = settings.nrfCloudSettings
	const locationServiceToken = await fetchToken({ apiEndpoint, apiKey })

	const {
		ts,
		data: {
			networkInfo: { rsrp, areaCode, mccmnc, cellID },
		},
	} = event.message
	const cell: Parameters<typeof cellId>[0] = {
		mccmnc,
		area: areaCode,
		cell: cellID,
	}

	let message: Static<typeof SingleCellGeoLocation>

	const maybeCached = await getCached(cell)

	if (maybeCached !== null) {
		message = {
			'@context': Context.singleCellGeoLocation.toString(),
			...maybeCached,
			ts,
		}
		track('single-cell:cached', MetricUnit.Count, 1)
	} else {
		const body = {
			lte: [
				{
					mcc: parseInt(mccmnc.toString().slice(0, -2), 10),
					mnc: mccmnc.toString().slice(-2),
					eci: cellID,
					tac: areaCode,
					rsrp,
				},
			],
		}

		const vf = validatedFetch(
			{ endpoint: apiEndpoint, apiKey: locationServiceToken },
			trackFetch,
		)
		const maybeResult = await vf(
			{ resource: 'location/ground-fix', payload: JSONPayload(body) },
			GroundFix,
		)

		if ('error' in maybeResult) {
			track('single-cell:error', MetricUnit.Count, 1)
			log.error('Failed to resolve cell location:', {
				error: maybeResult.error,
			})

			return
		}

		track('single-cell:resolved', MetricUnit.Count, 1)
		const { lat, lon, uncertainty } = maybeResult.result
		message = {
			'@context': Context.singleCellGeoLocation.toString(),
			lat,
			lng: lon,
			accuracy: uncertainty,
			ts,
		}
		await cache(cell, message)
	}

	log.debug('result', { message })

	const converted = await proto({
		onError: (message, model, error) => {
			log.error('Could not transform message', {
				payload: message,
				model,
				error,
			})
		},
	})(model, message)

	log.debug('converted', { converted })

	await Promise.all(
		converted.map(async (message) =>
			eventBus.putEvents({
				Entries: [
					{
						EventBusName,
						Source: 'thingy.ws',
						DetailType: 'message',
						Detail: JSON.stringify(<WebsocketPayload>{
							deviceId,
							message,
						}),
					},
				],
			}),
		),
	)
}

export const handler = middy(h).use(logMetrics(metrics))
