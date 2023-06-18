import {
	ApiGatewayManagementApiClient,
	PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi'
import {
	DeleteItemCommand,
	DynamoDBClient,
	ExecuteStatementCommand,
} from '@aws-sdk/client-dynamodb'
import {
	EventBridgeClient,
	PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import type { WebsocketPayload } from '../lambda/publishToWebsocketClients.js'
import { logger } from '../lambda/util/logger.js'

const log = logger('notifyClients')
const eventBus = new EventBridgeClient({})

export const notifyClients =
	({
		db,
		connectionsTableName,
		connectionsIndexName,
		apiGwManagementClient,
		eventBusName,
	}: {
		db: DynamoDBClient
		connectionsTableName: string
		connectionsIndexName: string
		apiGwManagementClient: ApiGatewayManagementApiClient
		eventBusName: string
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
					await Promise.all([
						eventBus.send(
							new PutEventsCommand({
								Entries: [
									{
										EventBusName: eventBusName,
										Source: 'thingy.ws',
										DetailType: 'disconnect',
										Detail: JSON.stringify(<WebsocketPayload>{
											deviceId,
											connectionId,
										}),
									},
								],
							}),
						),
						db.send(
							new DeleteItemCommand({
								TableName: connectionsTableName,
								Key: {
									connectionId: {
										S: connectionId,
									},
								},
							}),
						),
					])
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
