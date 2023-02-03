import { DeleteItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type {
	APIGatewayProxyStructuredResultV2,
	APIGatewayProxyWebsocketEventV2,
} from 'aws-lambda'
import { logger } from './logger.js'
const { TableName, EventBusName } = fromEnv({
	TableName: 'CONNECTIONS_TABLE_NAME',
	EventBusName: 'EVENTBUS_NAME',
})(process.env)

const log = logger('disconnect')
const db = new DynamoDBClient({})
const eventBus = new EventBridge({})

export const handler = async (
	event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
	log.info('onDisconnect event', { event })

	await eventBus.putEvents({
		Entries: [
			{
				EventBusName: EventBusName,
				Source: 'thingy.ws',
				DetailType: 'disconnect',
				Detail: JSON.stringify({
					context: {
						connectionId: event.requestContext.connectionId,
					},
				}),
			},
		],
	})

	await db.send(
		new DeleteItemCommand({
			TableName,
			Key: {
				connectionId: {
					S: event.requestContext.connectionId,
				},
			},
		}),
	)

	return {
		statusCode: 200,
		body: `Disconnected. Good bye ${event.requestContext.connectionId}!`,
	}
}
