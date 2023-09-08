import { MetricUnits, logMetrics } from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { proto } from '@hello.nrfcloud.com/proto/hello/model/PCA20035+solar'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { metricsForComponent } from './metrics/metrics.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from './util/logger.js'
import { getDeviceAttributesById } from './getDeviceAttributes.js'

const { EventBusName, DevicesTableName } = fromEnv({
	EventBusName: 'EVENTBUS_NAME',
	DevicesTableName: 'DEVICES_TABLE_NAME',
})(process.env)

const log = logger('deviceMessage')
const db = new DynamoDBClient({})
const eventBus = new EventBridge({})

const deviceFetcher = getDeviceAttributesById({ db, DevicesTableName })

const { track, metrics } = metricsForComponent('onDeviceMessage')

const h = async (event: {
	message: unknown
	deviceId: string
	timestamp: number
}): Promise<void> => {
	log.debug('event', { event })
	track('deviceMessage', MetricUnits.Count, 1)
	const { deviceId, message } = event

	// Fetch model for device
	const { model } = await deviceFetcher(deviceId)

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
		track('unknownDeviceMessage', MetricUnits.Count, 1)
	} else {
		track('convertedDeviceMessage', MetricUnits.Count, converted.length)
	}

	await Promise.all(
		converted.map(async (message) => {
			log.debug('websocket message', { payload: message })
			return eventBus.putEvents({
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
		}),
	)
}

export const handler = middy(h).use(logMetrics(metrics))
