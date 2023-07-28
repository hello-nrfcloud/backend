import { MetricUnits, logMetrics } from '@aws-lambda-powertools/metrics'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import {
	Context,
	SingleCellGeoLocation,
	lat as TLat,
	lng as TLng,
	accuracy as TAccuracy,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { metricsForComponent } from './metrics/metrics.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from './util/logger.js'
import { Type, type Static } from '@sinclair/typebox'
import { slashless } from '../util/slashless.js'
import { validateWithTypeBox } from '@hello.nrfcloud.com/proto'
import { getNrfCloudAPIConfig } from './getNrfCloudAPIConfig.js'
import { proto } from '@hello.nrfcloud.com/proto/hello/model/PCA20035+solar'
import { getDeviceModelById } from './getDeviceModel.js'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { once } from 'lodash-es'

const { EventBusName, stackName, DevicesTableName } = fromEnv({
	EventBusName: 'EVENTBUS_NAME',
	stackName: 'STACK_NAME',
	DevicesTableName: 'DEVICES_TABLE_NAME',
})(process.env)

const log = logger('singleCellGeo')
const eventBus = new EventBridge({})
const db = new DynamoDBClient({})

const modelFetcher = getDeviceModelById({ db, DevicesTableName })

const serviceToken = once(
	async ({ apiEndpoint, apiKey }: { apiEndpoint: URL; apiKey: string }) => {
		const url = `${slashless(apiEndpoint)}/v1/account/service-token`
		const res = await fetch(url, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
		})
		if (!res.ok) {
			const body = await res.text()
			console.error('request failed', {
				body,
				status: res.status,
			})
			throw new Error(`Acquiring service token failed: ${body} (${res.status})`)
		}
		const { token } = (await res.json()) as {
			createdAt: string // e.g. '2022-12-19T19:39:02.655Z'
			token: string // JWT
		}
		return token
	},
)

const { track, metrics } = metricsForComponent('singleCellGeo')

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
	const { apiEndpoint, apiKey } = await getNrfCloudAPIConfig(stackName)
	const model = await modelFetcher(deviceId)
	const locationServiceToken = await serviceToken({ apiEndpoint, apiKey })

	const {
		ts,
		data: {
			networkInfo: { rsrp, areaCode, mccmnc, cellID },
		},
	} = event.message
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
	log.debug(`body`, body)

	const url = `${slashless(apiEndpoint)}/v1/location/ground-fix`
	log.debug(`url`, url)

	const start = Date.now()

	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${locationServiceToken}`,
		},
		body: JSON.stringify(body),
	})

	track('apiResponseTime', MetricUnits.Milliseconds, Date.now() - start)

	if (!res.ok) {
		track('single-cell:error', MetricUnits.Count, 1)
		console.error('request failed', {
			body: await res.text(),
			status: res.status,
		})
		return
	}

	const response = await res.json()
	const maybeLocation = validateWithTypeBox(
		Type.Object({
			lat: TLat, // 63.41999531
			lon: TLng, // 10.42999506
			uncertainty: TAccuracy, // 2420
			fulfilledWith: Type.Literal('SCELL'),
		}),
	)(response)
	if ('errors' in maybeLocation) {
		throw new Error(
			`Failed to resolve cell location: ${JSON.stringify(response)}`,
		)
	}
	track('single-cell:resolved', MetricUnits.Count, 1)
	const { lat, lon, uncertainty } = maybeLocation.value
	const message: Static<typeof SingleCellGeoLocation> = {
		'@context': Context.singleCellGeoLocation.toString(),
		lat,
		lng: lon,
		accuracy: uncertainty,
		ts,
	}
	console.log('result', message)

	const converted = await proto({
		onError: (message, model, error) => {
			log.error('Could not transform message', {
				payload: message,
				model,
				error,
			})
		},
	})(model, message)

	console.log('converted', converted)

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
