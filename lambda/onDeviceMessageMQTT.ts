import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { proto } from '@hello.nrfcloud.com/proto/hello/model/PCA20035+solar'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { getDeviceAttributesById } from './getDeviceAttributes.js'

const { EventBusName, DevicesTableName } = fromEnv({
	EventBusName: 'EVENTBUS_NAME',
	DevicesTableName: 'DEVICES_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})
const eventBus = new EventBridge({})

const deviceFetcher = getDeviceAttributesById({ db, DevicesTableName })

const { track, metrics } = metricsForComponent('deviceMessage')

const h = async (event: {
	message: unknown
	deviceId: string
	timestamp: number
}): Promise<void> => {
	console.debug({ event })
	track('deviceMessageMQTT', MetricUnit.Count, 1)
	const { deviceId, message } = event

	// Fetch model for device
	const { model } = await deviceFetcher(deviceId)

	const converted = await proto({
		onError: (message, model, error) => {
			console.error(
				'Could not transform message',
				JSON.stringify({
					payload: message,
					model,
					error,
				}),
			)
		},
	})(model, message)

	if (converted.length === 0) {
		track('unknownDeviceMessageMQTT', MetricUnit.Count, 1)
	} else {
		track('convertedDeviceMessageMQTT', MetricUnit.Count, converted.length)
	}

	await Promise.all(
		converted.map(async (message) => {
			console.debug('websocket message', JSON.stringify({ payload: message }))
			return eventBus.putEvents({
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
			})
		}),
	)
}

export const handler = middy(h).use(logMetrics(metrics))
