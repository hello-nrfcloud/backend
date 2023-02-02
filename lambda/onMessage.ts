import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'
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

const log = logger('message')
const db = new DynamoDBClient({})
const eventBus = new EventBridge({})

export const handler = async (
	event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
	log.info('onMessage event', { event })

	// Query device id based on connection id
	const { Item } = await db.send(
		new GetItemCommand({
			TableName,
			Key: {
				connectionId: {
					S: event.requestContext.connectionId,
				},
			},
		}),
	)
	const deviceId = Item?.deviceId?.S

	const body = JSON.parse(event.body!)
	const action = body.action
	const payload = body.payload ?? {}
	switch (action) {
		case 'echo':
			await eventBus.putEvents({
				Entries: [
					{
						EventBusName: EventBusName,
						Source: 'ws.broadcast',
						DetailType: 'action: echo',
						Detail: JSON.stringify({
							context: {
								deviceId,
								connectionId: event.requestContext.connectionId,
							},
							payload,
							targets: [deviceId],
						}),
					},
				],
			})
			break
		case 'broadcast':
			await eventBus.putEvents({
				Entries: [
					{
						EventBusName: EventBusName,
						Source: 'ws.broadcast',
						DetailType: 'action: broadcast',
						Detail: JSON.stringify({
							context: {
								deviceId,
								connectionId: event.requestContext.connectionId,
							},
							payload,
						}),
					},
				],
			})
			break
	}

	// await db.send(
	// 	new UpdateItemCommand({
	// 		TableName,
	// 		Key: {
	// 			connectionId: {
	// 				S: event.requestContext.connectionId,
	// 			},
	// 		},
	// 		UpdateExpression: 'SET #lastSeen = :lastSeen',
	// 		ExpressionAttributeNames: {
	// 			'#lastSeen': 'lastSeen',
	// 		},
	// 		ExpressionAttributeValues: {
	// 			':lastSeen': {
	// 				S: new Date().toISOString(),
	// 			},
	// 		},
	// 	}),
	// )

	return {
		statusCode: 200,
		body: `Got your message, ${event.requestContext.connectionId}!`,
	}
}
