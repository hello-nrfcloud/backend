import { DeleteItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
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
		'onDisconnect:event',
		JSON.stringify({
			event,
		}),
	)

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
		body: `Disconnected. Good bye ${event.requestContext.connectionId}!.`,
	}
}
