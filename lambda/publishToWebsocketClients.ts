import { ApiGatewayManagementApi } from '@aws-sdk/client-apigatewaymanagementapi'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@bifravst/from-env'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import type { EventBridgeEvent } from 'aws-lambda'
import { notifyClients } from '../websocket/notifyClients.js'

export type WebsocketPayload = {
	deviceId: string
	// If present, only send payload to this specific connection
	connectionId?: string
	nRFCloudAccount?: string
	message: Record<string, unknown>
}

const { connectionsTableName, websocketManagementAPIURL } = fromEnv({
	connectionsTableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
	websocketManagementAPIURL: 'WEBSOCKET_MANAGEMENT_API_URL',
})(process.env)

const log = logger('publishToWebsockets')
const db = new DynamoDBClient({})
export const apiGwManagementClient = new ApiGatewayManagementApi({
	endpoint: websocketManagementAPIURL,
})

const notifier = notifyClients({
	db,
	connectionsTableName,
	apiGwManagementClient,
})

export const handler = async (
	event: EventBridgeEvent<'message' | 'connect' | 'error', WebsocketPayload>,
): Promise<void> => {
	log.debug({ event })

	await notifier(event.detail)
}
