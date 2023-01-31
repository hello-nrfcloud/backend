import { Logger } from '@aws-lambda-powertools/logger'
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type {
	APIGatewayProxyStructuredResultV2,
	APIGatewayProxyWebsocketEventV2,
} from 'aws-lambda'
const { TableName, level } = fromEnv({
	TableName: 'CONNECTIONS_TABLE_NAME',
	level: 'LOG_LEVEL',
})(process.env)

const logger = new Logger({
	logLevel: level ?? 'info',
	serviceName: 'ws:message',
})
const db = new DynamoDBClient({})

export const handler = async (
	event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
	try {
		logger.info('event', { event })

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

		logger.info('Items', { Item })

		const action = JSON.parse(event.body ?? 'null').action
		logger.info('Action', { action })
		let body: Record<string, unknown> = {}
		switch (action) {
			case 'send':
				body = { action }
				break
			default:
				body = { connectionId: event.requestContext.connectionId }
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
			body: JSON.stringify(body),
		}
	} catch (error) {
		logger.error('error', { error })
		return {
			statusCode: 500,
			body: (error as Error).message,
		}
	}
}
