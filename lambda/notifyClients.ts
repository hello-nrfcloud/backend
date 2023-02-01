import {
	ApiGatewayManagementApiClient,
	PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi'
import {
	DeleteItemCommand,
	DynamoDBClient,
	ScanCommand,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { logger } from './logger.js'

const log = logger('notifyClients')
export type WSEvent = Record<string, unknown>

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
	async (event: WSEvent, deviceIds?: string[]): Promise<void> => {
		log.info('notifyClients event', { event, deviceIds })

		const connectionIds: string[] = await getActiveConnections(
			db,
			connectionsTableName,
			deviceIds,
		)

		log.info('active connections', { connectionIds })
		for (const connectionId of connectionIds) {
			try {
				await apiGwManagementClient.send(
					new PostToConnectionCommand({
						ConnectionId: connectionId,
						Data: Buffer.from(
							JSON.stringify({
								...event,
							}),
						),
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

// const getEventContext = (event: WSEvent): string | null => {
// 	return 'https://thingy.rocks/event'
// }

export async function getActiveConnections(
	db: DynamoDBClient,
	connectionsTableName: string,
	deviceIds?: string[],
): Promise<string[]> {
	const res = await db.send(
		new ScanCommand({
			TableName: connectionsTableName,
		}),
	)

	const connectionIds = res?.Items?.reduce<string[]>((acc, item) => {
		const { connectionId, deviceId } = unmarshall(item)

		if (connectionId as string) {
			const filterByDeviceId = !!deviceIds
			if (filterByDeviceId) {
				if (deviceIds.includes(deviceId)) acc.push(connectionId as string)
			} else {
				acc.push(connectionId as string)
			}
		}

		return acc
	}, [])

	return connectionIds ?? []
}
