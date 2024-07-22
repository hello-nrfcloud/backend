import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { Context, type DeviceIdentity } from '@hello.nrfcloud.com/proto/hello'
import { fromEnv } from '@bifravst/from-env'
import type { Static } from '@sinclair/typebox'
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { lastSeenRepo } from '../lastSeen/lastSeenRepo.js'
import { connectionsRepository } from '../websocket/connectionsRepository.js'
import { getLwM2MShadow } from '../lwm2m/getLwM2MShadow.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import type { AuthorizedEvent } from './ws/AuthorizedEvent.js'
import { sendShadowToConnection } from './ws/sendShadowToConnection.js'
import middy from '@middy/core'
import { requestLogger } from './middleware/requestLogger.js'

const { EventBusName, TableName, LastSeenTableName } = fromEnv({
	EventBusName: 'EVENTBUS_NAME',
	TableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
	LastSeenTableName: 'LAST_SEEN_TABLE_NAME',
})(process.env)

const log = logger('connect')
const eventBus = new EventBridge({})
const db = new DynamoDBClient({})
const iotData = new IoTDataPlaneClient({})

const repo = connectionsRepository(db, TableName)
const { getLastSeenOrNull } = lastSeenRepo(db, LastSeenTableName)

const sendShadow = sendShadowToConnection({
	eventBus,
	eventBusName: EventBusName,
	log,
})
const getShadow = getLwM2MShadow(iotData)

const h = async (
	event: AuthorizedEvent,
): Promise<APIGatewayProxyStructuredResultV2> => {
	const context = event.requestContext.authorizer
	const { connectionId } = event.requestContext
	log.debug('ws:connect', connectionId)
	const { deviceId, model } = context
	if ('account' in context) {
		const { account } = context
		await repo.add({
			deviceId,
			model,
			account,
			connectionId,
			ttl: Math.round(Date.now() / 1000) + 5 * 60,
		})
	}

	// Mask lastSeen if it is before the hideDataBefore date
	let lastSeen = (await getLastSeenOrNull(deviceId))?.toISOString() ?? undefined
	if (
		lastSeen !== undefined &&
		'hideDataBefore' in context &&
		context.hideDataBefore !== undefined
	) {
		const hideDataBefore = new Date(context.hideDataBefore)
		if (hideDataBefore > new Date(lastSeen)) {
			lastSeen = undefined
		}
	}

	const message: Static<typeof DeviceIdentity> = {
		'@context': Context.deviceIdentity.toString(),
		model,
		id: deviceId,
		lastSeen,
	}
	if ('hideDataBefore' in context)
		message.hideDataBefore = context.hideDataBefore

	log.debug('websocket message', { message })
	await eventBus.putEvents({
		Entries: [
			{
				EventBusName,
				Source: 'hello.ws',
				DetailType: Context.deviceIdentity.toString(),
				Detail: JSON.stringify(<WebsocketPayload>{
					deviceId,
					connectionId,
					message,
				}),
			},
		],
	})

	// Send the LwM2M shadow
	const maybeShadow = await getShadow({
		id: deviceId,
		hideDataBefore:
			'hideDataBefore' in context && typeof context.hideDataBefore === 'string'
				? new Date(context.hideDataBefore)
				: undefined,
	})
	if ('error' in maybeShadow) {
		log.debug('failed to fetch shadow', {
			deviceId,
			error: maybeShadow.error.message,
		})
	} else {
		log.debug('sending shadow', {
			deviceId,
			connectionId,
		})
		await sendShadow({
			deviceId,
			model,
			shadow: maybeShadow.shadow,
			connectionId,
		})
	}

	return {
		statusCode: 200,
	}
}

export const handler = middy().use(requestLogger()).handler(h)
