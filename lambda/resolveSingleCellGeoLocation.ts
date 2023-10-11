import { MetricUnits, logMetrics } from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { SSMClient } from '@aws-sdk/client-ssm'
import {
	Context,
	SingleCellGeoLocation,
	accuracy as TAccuracy,
	lat as TLat,
	lng as TLng,
} from '@hello.nrfcloud.com/proto/hello'
import { proto } from '@hello.nrfcloud.com/proto/hello/model/PCA20035+solar'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { Type, type Static } from '@sinclair/typebox'
import { once } from 'lodash-es'
import { get, store } from '../cellGeoLocation/SingleCellGeoLocationCache.js'
import { cellId } from '../cellGeoLocation/cellId.js'
import { getAllAccountsSettings } from '../nrfcloud/allAccounts.js'
import { slashless } from '../util/slashless.js'
import { getDeviceAttributesById } from './getDeviceAttributes.js'
import { validatedLoggingFetch } from './loggingFetch.js'
import { metricsForComponent } from './metrics/metrics.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from './util/logger.js'

const { EventBusName, stackName, DevicesTableName, cacheTableName } = fromEnv({
	EventBusName: 'EVENTBUS_NAME',
	stackName: 'STACK_NAME',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	cacheTableName: 'CACHE_TABLE_NAME',
})(process.env)

const log = logger('singleCellGeo')
const eventBus = new EventBridge({})
const db = new DynamoDBClient({})
const ssm = new SSMClient({})

const deviceFetcher = getDeviceAttributesById({ db, DevicesTableName })

const { track, metrics } = metricsForComponent('singleCellGeo')

const trackFetch = validatedLoggingFetch({ track, log })

const getCached = get({
	db,
	TableName: cacheTableName,
})
const cache = store({
	db,
	TableName: cacheTableName,
})

const serviceToken = once(
	async ({ apiEndpoint, apiKey }: { apiEndpoint: URL; apiKey: string }) => {
		const maybeResult = await trackFetch(
			new URL(`${slashless(apiEndpoint)}/v1/account/service-token`),
			{
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`,
				},
			},
			Type.Object({
				token: Type.String(),
			}),
		)

		if ('error' in maybeResult) {
			log.error('request failed', { error: maybeResult.error })
			throw new Error(`Acquiring service token failed: ${maybeResult.error}`)
		}

		return maybeResult.result.token
	},
)

const allAccountsSettings = once(getAllAccountsSettings({ ssm, stackName }))

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
	const locationServiceToken = await serviceToken({ apiEndpoint, apiKey })

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
		track('single-cell:cached', MetricUnits.Count, 1)
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
		const maybeResult = await trackFetch(
			new URL(`${slashless(apiEndpoint)}/v1/location/ground-fix`),
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${locationServiceToken}`,
				},
				body: JSON.stringify(body),
			},
			Type.Object({
				lat: TLat, // 63.41999531
				lon: TLng, // 10.42999506
				uncertainty: TAccuracy, // 2420
				fulfilledWith: Type.Literal('SCELL'),
			}),
		)

		if ('error' in maybeResult) {
			track('single-cell:error', MetricUnits.Count, 1)
			log.error('Failed to resolve cell location:', {
				error: maybeResult.error,
			})

			return
		}

		track('single-cell:resolved', MetricUnits.Count, 1)
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
