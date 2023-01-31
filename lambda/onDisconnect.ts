import { Logger } from '@aws-lambda-powertools/logger'
import { DeleteItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
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
	serviceName: 'ws:disconnect',
})
const db = new DynamoDBClient({})

export const handler = async (
	event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
	logger.info('event', { event })

	const { Attributes } = await db.send(
		new DeleteItemCommand({
			TableName,
			Key: {
				connectionId: {
					S: event.requestContext.connectionId,
				},
			},
		}),
	)
	logger.info(`Delete item`, { Attributes })

	return {
		statusCode: 200,
		body: `Disconnected. Good bye ${event.requestContext.connectionId}!`,
	}
}
