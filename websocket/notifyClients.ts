import type { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi'
import { PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi'
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
	DeleteItemCommand,
	ExecuteStatementCommand,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import type { WebsocketPayload } from '../lambda/publishToWebsocketClients.js'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'

const log = logger('notifyClients')

export const notifyClients =
	({
		db,
		connectionsTableName,
		apiGwManagementClient,
	}: {
		db: DynamoDBClient
		connectionsTableName: string
		apiGwManagementClient: ApiGatewayManagementApiClient
	}) =>
	async (event: WebsocketPayload): Promise<void> => {
		const { connectionId, deviceId, message } = event
		const connectionIds: string[] = []
		if (connectionId !== undefined) {
			connectionIds.push(connectionId)
		} else {
			connectionIds.push(
				...(await getActiveConnections(db, connectionsTableName, deviceId)),
			)
			log.debug(
				`${connectionIds.length} active connections found for device ${deviceId}.`,
			)
		}

		log.info(`Notifying ${connectionIds.length} clients ...`)
		for (const connectionId of connectionIds) {
			log.debug(connectionId)
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
	deviceId: string,
): Promise<string[]> => {
	const res = await db.send(
		new ExecuteStatementCommand({
			Statement: `select connectionId from "${connectionsTableName}" where deviceId = ? AND ttl > ?`,
			Parameters: [
				{ S: deviceId },
				{ N: Math.floor(Date.now() / 1000).toString() },
			],
		}),
	)

	const connectionIds = res?.Items?.reduce<string[]>((acc, item) => {
		const { connectionId } = unmarshall(item)
		acc.push(connectionId as string)
		return acc
	}, [])

	return connectionIds ?? []
}
