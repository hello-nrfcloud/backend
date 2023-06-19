import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { proto, type HelloMessage } from '@hello.nrfcloud.com/proto/hello'
import type { GROUND_FIX } from '@hello.nrfcloud.com/proto/nrfCloud/types/types.js'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { Static } from '@sinclair/typebox'
import { getModelForDevice } from '../devices/getModelForDevice.js'
import { locationServiceAPIClient } from '../nrfcloud/locationServiceAPIClient.js'
import { defaultApiEndpoint } from '../nrfcloud/settings.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { getNRFCloudSSMParameters } from './util/getSSMParameter.js'
import { logger } from './util/logger.js'

const { EventBusName, DevicesTableName, stackName } = fromEnv({
	stackName: 'STACK_NAME',
	EventBusName: 'EVENTBUS_NAME',
	DevicesTableName: 'DEVICES_TABLE_NAME',
})(process.env)

type ConvertedMessage = Static<typeof HelloMessage>

const log = logger('deviceMessage')
const db = new DynamoDBClient({})
const eventBus = new EventBridge({})

const modelFetcher = getModelForDevice({ db, DevicesTableName })

const apiClientPromise = (async () => {
	const [apiEndpoint, serviceKey, teamId] = await getNRFCloudSSMParameters(
		stackName,
		['apiEndpoint', 'serviceKey', 'teamId'],
	)
	if (serviceKey === undefined)
		throw new Error(`nRF Cloud service key for ${stackName} is not configured.`)
	if (teamId === undefined)
		throw new Error(`nRF Cloud team ID for ${stackName} is not configured.`)
	return locationServiceAPIClient({
		endpoint:
			apiEndpoint !== undefined ? new URL(apiEndpoint) : defaultApiEndpoint,
		serviceKey,
		teamId,
	})
})()

const preprocessMessage =
	(apiClient: ReturnType<typeof locationServiceAPIClient>) =>
	async (message: unknown, ts: number): Promise<unknown> => {
		// If it is nRF Cloud site survey message, we resolve location using ground fix API
		if (
			typeof message === 'object' &&
			message !== null &&
			'appId' in message &&
			message.appId === 'GROUND_FIX'
		) {
			return await apiClient.groundFix((message as GROUND_FIX).data, ts)
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
	const client = await apiClientPromise
	const { deviceId, message, timestamp } = event
	const { model } = await modelFetcher(deviceId)
	log.debug('model', { model })

	const processedMessage = await preprocessMessage(client)(message, timestamp)
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
