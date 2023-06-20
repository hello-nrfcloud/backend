import {
	MetricUnits,
	Metrics,
	logMetrics,
} from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { proto, type HelloMessage } from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { Static } from '@sinclair/typebox'
import { getModelForDevice } from '../devices/getModelForDevice.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from './util/logger.js'

const { EventBusName, DevicesTableName } = fromEnv({
	EventBusName: 'EVENTBUS_NAME',
	DevicesTableName: 'DEVICES_TABLE_NAME',
})(process.env)

type ConvertedMessage = Static<typeof HelloMessage>

const log = logger('deviceMessage')
const db = new DynamoDBClient({})
const eventBus = new EventBridge({})

const modelFetcher = getModelForDevice({ db, DevicesTableName })

const parseMessage = async (
	model: string,
	message: unknown,
): Promise<ConvertedMessage[]> => {
	const converted = await proto({
		onError: (message, model, error) => {
			log.error('Could not transform message', {
				payload: message,
				model,
				error,
			})
		},
	})(model, message)

	return converted
}

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
	const { deviceId, message } = event
	const { model } = await modelFetcher(deviceId)
	log.debug('model', { model })

	metrics.addMetric('deviceMessage', MetricUnits.Count, 1)

	const converted = await parseMessage(model, message)

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
