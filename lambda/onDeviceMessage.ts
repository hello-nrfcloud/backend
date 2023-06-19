import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { proto, type HelloMessage } from '@hello.nrfcloud.com/proto/hello'
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

export const handler = async (event: {
	message: unknown
	deviceId: string
	timestamp: number
}): Promise<void> => {
	log.debug('event', { event })
	const { deviceId, message } = event
	const { model } = await modelFetcher(deviceId)
	log.debug('model', { model })

	const converted = await parseMessage(model, message)

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
