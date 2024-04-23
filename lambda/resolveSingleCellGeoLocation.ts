import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { SSMClient } from '@aws-sdk/client-ssm'
import { Context, SingleCellGeoLocation } from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { type Static } from '@sinclair/typebox'
import { once } from 'lodash-es'
import {
	get,
	store,
	cellId,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/cellGeoLocation'
import {
	groundFix,
	serviceToken,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { getDeviceAttributesById } from './getDeviceAttributes.js'
import { loggingFetch } from './loggingFetch.js'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { getAllAccountsSettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'

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

const allAccountsSettings = once(async () =>
	getAllAccountsSettings({ ssm, stackName }),
)
const fetchToken = once(async (args: Parameters<typeof serviceToken>[0]) =>
	serviceToken(args)(),
)

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
	const { apiEndpoint, apiKey } = settings
	const locationServiceToken = await fetchToken({
		endpoint: apiEndpoint,
		apiKey,
	})
	if ('error' in locationServiceToken) {
		throw new Error(`Acquiring service token failed.`)
	}
	const fetchLocation = groundFix({
		apiKey: locationServiceToken.token,
		endpoint: apiEndpoint,
	})

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
		const maybeResult = await fetchLocation({
			mcc: parseInt(mccmnc.toString().slice(0, -2), 10),
			mnc: mccmnc.toString().slice(-2),
			eci: cellID,
			tac: areaCode,
			rsrp,
		})

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
						Source: 'hello.ws',
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
