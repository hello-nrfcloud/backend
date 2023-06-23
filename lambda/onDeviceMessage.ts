import {
	MetricUnits,
	Metrics,
	logMetrics,
} from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { proto } from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { getModelForDevice } from '../devices/getModelForDevice.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from './util/logger.js'

const { EventBusName, DevicesTableName } = fromEnv({
	EventBusName: 'EVENTBUS_NAME',
	DevicesTableName: 'DEVICES_TABLE_NAME',
})(process.env)

const log = logger('deviceMessage')
const db = new DynamoDBClient({})
const eventBus = new EventBridge({})

const modelFetcher = getModelForDevice({ db, DevicesTableName })
const deviceModelCache: Record<string, string> = {}

const metrics = new Metrics({
	namespace: 'hello-nrfcloud-backend',
	serviceName: 'onDeviceMessage',
})

const h = async (event: {
	message: unknown
	deviceId: string
	timestamp: number
}): Promise<void> => {
	log.debug('event', { event })
	metrics.addMetric('deviceMessage', MetricUnits.Count, 1)
	const { deviceId, message } = event

	// Fetch model for device
	if (deviceModelCache[deviceId] === undefined) {
		const maybeModel = await modelFetcher(deviceId)
		if ('error' in maybeModel) {
			log.error(maybeModel.error.message)
		} else {
			deviceModelCache[deviceId] = maybeModel.model
		}
	}
	const model = deviceModelCache[deviceId]
	if (model === undefined) {
		metrics.addMetric('unknownDeviceModel', MetricUnits.Count, 1)
		return
	}
	log.debug('model', { model })

	const converted = await proto({
		onError: (message, model, error) => {
			log.error('Could not transform message', {
				payload: message,
				model,
				error,
			})
		},
	})(model, message)

	if (converted.length === 0) {
		metrics.addMetric('unknownDeviceMessage', MetricUnits.Count, 1)
	} else {
		metrics.addMetric(
			'convertedDeviceMessage',
			MetricUnits.Count,
			converted.length,
		)
	}

	for (const message of converted) {
		log.debug('websocket message', { payload: message })
		await eventBus.putEvents({
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
		})
	}
}

export const handler = middy(h).use(logMetrics(metrics))
