import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
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

const log = logger('connect')
const db = new DynamoDBClient({})
const eventBus = new EventBridge({})

export const handler = async (
	event: APIGatewayProxyWebsocketEventV2 & {
		queryStringParameters?: Record<string, any>
	},
): Promise<APIGatewayProxyStructuredResultV2> => {
	log.info('onConnect event', { event })

	// TODO: Validate token against DB
	const deviceId = event.queryStringParameters?.deviceId ?? null
	if (deviceId === null) {
		log.warn('Device id is not found', { deviceId })
		return {
			statusCode: 400,
			body: `Device id is not found`,
		}
	}

	await eventBus.putEvents({
		Entries: [
			{
				EventBusName: EventBusName,
				Source: 'thingy.ws',
				DetailType: 'connect',
				Detail: JSON.stringify({
					context: {
						deviceId,
						connectionId: event.requestContext.connectionId,
					},
				}),
			},
		],
	})

	await db.send(
		new PutItemCommand({
			TableName,
			Item: {
				connectionId: {
					S: event.requestContext.connectionId,
				},
				deviceId: {
					S: deviceId,
				},
				lastSeen: {
					S: new Date().toISOString(),
				},
				ttl: {
					N: `${Math.round(Date.now() / 1000) + 60 * 60}`,
				},
			},
		}),
	)

	return {
		statusCode: 200,
		body: `Connected. Hello ${event.requestContext.connectionId}@${deviceId}!`,
	}
}
