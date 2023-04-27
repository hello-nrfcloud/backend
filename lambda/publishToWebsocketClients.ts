import { ApiGatewayManagementApi } from '@aws-sdk/client-apigatewaymanagementapi'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { EventBridgeEvent } from 'aws-lambda'
import { logger } from './logger.js'
import { notifyClients } from './notifyClients.js'

export type WebsocketPayload = {
	deviceId: string
	// If present, only send payload to this specific connection
	connectionId?: string
	message: Record<string, unknown>
}

const {
	connectionsTableName,
	websocketManagementAPIURL,
	connectionsIndexName,
	eventBusName,
} = fromEnv({
	connectionsTableName: 'CONNECTIONS_TABLE_NAME',
	connectionsIndexName: 'CONNECTIONS_INDEX_NAME',
	websocketManagementAPIURL: 'WEBSOCKET_MANAGEMENT_API_URL',
	eventBusName: 'EVENTBUS_NAME',
})(process.env)

const log = logger('publishToWebsockets')
const db = new DynamoDBClient({})
export const apiGwManagementClient = new ApiGatewayManagementApi({
	endpoint: websocketManagementAPIURL,
})

const notifier = notifyClients({
	db,
	connectionsTableName,
	connectionsIndexName,
	apiGwManagementClient,
	eventBusName,
})

export const handler = async (
	event: EventBridgeEvent<
		'message' | 'connect' | 'disconnect',
		WebsocketPayload
	>,
): Promise<void> => {
	log.info('publishToWebSocketClients event', { event })

	// Do not publish websocket for disconnect type
	if (event['detail-type'] === 'disconnect') return

	await notifier(event.detail)
}
