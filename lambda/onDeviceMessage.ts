import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { proto } from '@nrf-guide/proto/nrfGuide'
import { getModelForDevice } from './getModelForDevice.js'
import { logger } from './logger.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'

const { EventBusName, DevicesTableName } = fromEnv({
	EventBusName: 'EVENTBUS_NAME',
	DevicesTableName: 'DEVICES_TABLE_NAME',
})(process.env)

const log = logger('deviceMessage')
const db = new DynamoDBClient({})
const eventBus = new EventBridge({})

const modelFetcher = getModelForDevice({ db, DevicesTableName })

export const handler = async (event: {
	message: unknown
	deviceId: string
	timestamp: string
}): Promise<void> => {
	log.debug('event', { event })
	const { deviceId, message } = event
	const { model } = await modelFetcher(deviceId)
	log.debug('model', { model })

	const converted = await proto({
		onError: (message, model, error) =>
			log.error('Could not transform message', { message, model, error }),
	})(model, message)

	for (const message of converted) {
		log.debug('websocket message', { message })
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
