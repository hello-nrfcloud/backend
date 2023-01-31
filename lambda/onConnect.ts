import { Logger } from '@aws-lambda-powertools/logger'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
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
	serviceName: 'ws:connect',
})
const db = new DynamoDBClient({})

export const handler = async (
	event: APIGatewayProxyWebsocketEventV2 & {
		queryStringParameters?: Record<string, any>
	},
): Promise<APIGatewayProxyStructuredResultV2> => {
	logger.info('event', { event })

	// TODO: Validate token against DB
	const deviceId = event.queryStringParameters?.deviceId ?? null
	if (deviceId === null) {
		logger.warn('Device id is not found', { deviceId })
		return {
			statusCode: 400,
			body: `Device id is not found`,
		}
	}

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
