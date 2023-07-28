import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { Context, DeviceIdentity } from '@hello.nrfcloud.com/proto/hello'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { Static } from '@sinclair/typebox'
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { lastSeenRepo } from '../lastSeen/lastSeenRepo.js'
import { connectionsRepository } from '../websocket/connectionsRepository.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from './util/logger.js'
import type { AuthorizedEvent } from './ws/AuthorizedEvent.js'

const { EventBusName, TableName, LastSeenTableName } = fromEnv({
	EventBusName: 'EVENTBUS_NAME',
	TableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
	LastSeenTableName: 'LAST_SEEN_TABLE_NAME',
})(process.env)

const log = logger('connect')
const eventBus = new EventBridge({})
const db = new DynamoDBClient({})

const repo = connectionsRepository(db, TableName)
const { getLastSeenOrNull } = lastSeenRepo(db, LastSeenTableName)

export const handler = async (
	event: AuthorizedEvent,
): Promise<APIGatewayProxyStructuredResultV2> => {
	log.debug('event', { event })

	const { deviceId, model, account } = event.requestContext.authorizer

	await repo.add({
		deviceId,
		model,
		account,
		connectionId: event.requestContext.connectionId,
		ttl: Math.round(Date.now() / 1000) + 5 * 60,
	})

	const message: Static<typeof DeviceIdentity> = {
		'@context': Context.deviceIdentity.toString(),
		model,
		id: deviceId,
		lastSeen: (await getLastSeenOrNull(deviceId))?.toISOString() ?? undefined,
	}

	log.debug('websocket message', { message })
	await eventBus.putEvents({
		Entries: [
			{
				EventBusName,
				Source: 'thingy.ws',
				DetailType: 'connect',
				Detail: JSON.stringify(<WebsocketPayload>{
					deviceId,
					connectionId: event.requestContext.connectionId,
					message,
				}),
			},
		],
	})

	return {
		statusCode: 200,
	}
}
