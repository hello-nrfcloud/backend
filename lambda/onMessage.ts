import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { connectionsRepository } from '../websocket/connectionsRepository.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from './util/logger.js'
import type { AuthorizedEvent } from './ws/AuthorizedEvent.js'

const { TableName, EventBusName } = fromEnv({
	TableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
	EventBusName: 'EVENTBUS_NAME',
})(process.env)

const log = logger('onMessage')
const db = new DynamoDBClient({})
const eventBus = new EventBridge({})

const repo = connectionsRepository(db, TableName)

export const handler = async (
	event: AuthorizedEvent,
): Promise<APIGatewayProxyStructuredResultV2> => {
	log.info('event', { event })
	await repo.extendTTL(event.requestContext.connectionId)

	if (event.body !== undefined) {
		const { payload } = JSON.parse(event.body)
		const { deviceId, model } = event.requestContext.authorizer
		await eventBus.putEvents({
			Entries: [
				{
					EventBusName,
					Source: 'thingy.ws',
					DetailType: 'request',
					Detail: JSON.stringify(<WebsocketPayload>{
						deviceId,
						connectionId: event.requestContext.connectionId,
						message: {
							request: payload,
							model,
						},
					}),
				},
			],
		})
	}

	return {
		statusCode: 200,
	}
}
