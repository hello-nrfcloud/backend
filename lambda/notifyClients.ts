import {
	ApiGatewayManagementApiClient,
	PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi'
import {
	DeleteItemCommand,
	DynamoDBClient,
	ExecuteStatementCommand,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { logger } from './logger.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'

const log = logger('notifyClients')

export const notifyClients =
	({
		db,
		connectionsTableName,
		connectionsIndexName,
		apiGwManagementClient,
	}: {
		db: DynamoDBClient
		connectionsTableName: string
		connectionsIndexName: string
		apiGwManagementClient: ApiGatewayManagementApiClient
	}) =>
	async (event: WebsocketPayload): Promise<void> => {
		const { connectionId, deviceId, message } = event
		const connectionIds: string[] =
			connectionId !== undefined && connectionId !== ''
				? [connectionId]
				: await getActiveConnections(
						db,
						connectionsTableName,
						connectionsIndexName,
						deviceId,
				  )

		for (const connectionId of connectionIds) {
			try {
				await apiGwManagementClient.send(
					new PostToConnectionCommand({
						ConnectionId: connectionId,
						Data: Buffer.from(JSON.stringify(message)),
					}),
				)
			} catch (err) {
				const error = err as Error
				if (error.name === 'GoneException') {
					log.warn(`Client is gone`, connectionId)
					await db.send(
						new DeleteItemCommand({
							TableName: connectionsTableName,
							Key: {
								connectionId: {
									S: connectionId,
								},
							},
						}),
					)
					continue
				}
				log.error(error.message, { error })
			}
		}
	}

export const getActiveConnections = async (
	db: DynamoDBClient,
	connectionsTableName: string,
	connectionsIndexName: string,
	deviceId: string,
): Promise<string[]> => {
	const res = await db.send(
		new ExecuteStatementCommand({
			Statement: `select connectionId from "${connectionsTableName}"."${connectionsIndexName}" where deviceId = ?`,
			Parameters: [{ S: deviceId }],
		}),
	)

	const connectionIds = res?.Items?.reduce<string[]>((acc, item) => {
		const { connectionId } = unmarshall(item)
		acc.push(connectionId as string)
		return acc
	}, [])

	return connectionIds ?? []
}
