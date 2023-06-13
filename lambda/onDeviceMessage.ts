import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { proto, type MuninnMessage } from '@bifravst/muninn-proto/Muninn'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { Static } from '@sinclair/typebox'
import { locationServiceAPIClient } from '../nrfcloud/locationServiceAPIClient.js'
import { getModelForDevice } from './getModelForDevice.js'
import { logger } from './logger.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'

const {
	EventBusName,
	DevicesTableName,
	nRFCloudEndpoint,
	nRFCloudServiceKey,
	nrfCloudTeamId,
} = fromEnv({
	EventBusName: 'EVENTBUS_NAME',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	nRFCloudEndpoint: 'NRFCLOUD_ENDPOINT',
	nRFCloudServiceKey: 'NRFCLOUD_SERVICE_KEY',
	nrfCloudTeamId: 'NRFCLOUD_TEAM_ID',
})(process.env)

type ConvertedMessage = Static<typeof MuninnMessage>

const log = logger('deviceMessage')
const db = new DynamoDBClient({})
const eventBus = new EventBridge({})

const modelFetcher = getModelForDevice({ db, DevicesTableName })

const apiClient = locationServiceAPIClient({
	endpoint: new URL(nRFCloudEndpoint),
	serviceKey: nRFCloudServiceKey,
	teamId: nrfCloudTeamId,
})

const preprocessMessage = async (
	message: unknown,
	ts: number,
): Promise<unknown> => {
	// If it is nRF Cloud site survey message, we resolve location using ground fix API
	if (
		typeof message === 'object' &&
		message !== null &&
		'appId' in message &&
		message.appId === 'GROUND_FIX'
	) {
		return await apiClient.groundFix(message, ts)
	}

	// Otherwise, pass though the message
	return message
}

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
	const { deviceId, message, timestamp } = event
	const { model } = await modelFetcher(deviceId)
	log.debug('model', { model })

	const processedMessage = await preprocessMessage(message, timestamp)
	const converted = await parseMessage(model, processedMessage)

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
