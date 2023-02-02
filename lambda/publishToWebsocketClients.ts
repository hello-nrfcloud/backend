import { ApiGatewayManagementApi } from '@aws-sdk/client-apigatewaymanagementapi'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { logger } from './logger.js'
import { notifyClients } from './notifyClients.js'

type Event = {
	id: string
	source: string
	'detail-type'?: string
	time: string
	detail: {
		context: {
			connectionId: string
		}
		payload?: Record<string, unknown>
		targets?: string[]
	}
}

const { connectionsTableName, websocketManagementAPIURL } = fromEnv({
	connectionsTableName: 'CONNECTIONS_TABLE_NAME',
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

export const handler = async (event: Event): Promise<void> => {
	log.info('publishToWebSocketClients event', { event })

	const caller = event.detail.context?.connectionId ?? 'unknown'
	const payload = event.detail.payload

	if (event.detail.targets) {
		await notifier({ caller, payload }, event.detail.targets)
	} else {
		await notifier({ caller, payload })
	}
}
