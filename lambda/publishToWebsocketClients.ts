import { ApiGatewayManagementApi } from '@aws-sdk/client-apigatewaymanagementapi'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { logger } from './logger.js'
import { notifyClients } from './notifyClients.js'

export type WebsocketPayload = {
	sender: string
	receivers: string[]
	payload: Record<string, unknown>
	topic?: string
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

	const { receivers, ...rest } = event.detail

	if (Array.isArray(receivers) && receivers.length) {
		const isBroadcast = receivers[0] === '*'

		if (isBroadcast) {
			await notifier(rest)
		} else {
			await notifier(rest, event.detail.receivers)
		}
	}
}
