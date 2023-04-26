import { ApiGatewayManagementApi } from '@aws-sdk/client-apigatewaymanagementapi'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { logger } from './logger.js'
import { notifyClients } from './notifyClients.js'

export type WebsocketPayload = {
	deviceId: string
	// If present, only send payload to this specific connection
	connectionId?: string
	message: Record<string, unknown>
}

type EventBridgeEvent = {
	id: string
	source: string
	'detail-type'?: string
	time: string
	detail: WebsocketPayload
}

const {
	connectionsTableName,
	websocketManagementAPIURL,
	connectionsIndexName,
} = fromEnv({
	connectionsTableName: 'CONNECTIONS_TABLE_NAME',
	connectionsIndexName: 'CONNECTIONS_INDEX_NAME',
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
	connectionsIndexName,
	apiGwManagementClient,
})

export const handler = async (event: EventBridgeEvent): Promise<void> => {
	log.info('publishToWebSocketClients event', { event })
	await notifier(event.detail)
}
