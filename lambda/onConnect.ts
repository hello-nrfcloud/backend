import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type {
	APIGatewayProxyStructuredResultV2,
	APIGatewayProxyWebsocketEventV2,
} from 'aws-lambda'
const { TableName } = fromEnv({ TableName: 'CONNECTIONS_TABLE_NAME' })(
	process.env,
)

const db = new DynamoDBClient({})

export const handler = async (
	event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
	console.log(
		'onConnect:event',
		JSON.stringify({
			event,
		}),
	)

	await db.send(
		new PutItemCommand({
			TableName,
			Item: {
				connectionId: {
					S: event.requestContext.connectionId,
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
		body: `Connected. Hello ${event.requestContext.connectionId}!`,
	}
}
