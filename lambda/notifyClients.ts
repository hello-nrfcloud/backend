import {
	ApiGatewayManagementApiClient,
	PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi'
import {
	DeleteItemCommand,
	DynamoDBClient,
	ExecuteStatementCommand,
	ExecuteStatementCommandOutput,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { logger } from './logger.js'

const log = logger('notifyClients')

type WebsocketEvent = {
	sender: string | Record<string, unknown>
	payload: Record<string, unknown>
}

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
	async (event: WebsocketEvent, deviceIds?: string[]): Promise<void> => {
		const connectionIds: string[] = await getActiveConnections(
			db,
			connectionsTableName,
			connectionsIndexName,
			deviceIds,
		)

		for (const connectionId of connectionIds) {
			try {
				await apiGwManagementClient.send(
					new PostToConnectionCommand({
						ConnectionId: connectionId,
						Data: Buffer.from(JSON.stringify(event)),
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

export async function getActiveConnections(
	db: DynamoDBClient,
	connectionsTableName: string,
	connectionsIndexName: string,
	deviceIds?: string[],
): Promise<string[]> {
	let res: ExecuteStatementCommandOutput

	if (deviceIds) {
		res = await db.send(
			new ExecuteStatementCommand({
				Statement: `select connectionId from "${connectionsTableName}"."${connectionsIndexName}" where deviceId in (${deviceIds
					.map(() => '?')
					.join(',')})`,
				Parameters: deviceIds.map((deviceId) => ({ S: deviceId })),
			}),
		)
	} else {
		res = await db.send(
			new ExecuteStatementCommand({
				Statement: `select connectionId from "${connectionsTableName}"`,
			}),
		)
	}

	const connectionIds = res?.Items?.reduce<string[]>((acc, item) => {
		const { connectionId } = unmarshall(item)
		acc.push(connectionId as string)
		return acc
	}, [])

	return connectionIds ?? []
}
