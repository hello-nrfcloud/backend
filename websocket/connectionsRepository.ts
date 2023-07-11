import {
	AttributeValue,
	ConditionalCheckFailedException,
	PutItemCommand,
	ScanCommand,
	UpdateItemCommand,
	type DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'

export type WebsocketDeviceConnection = {
	deviceId: string
	connectionId: string
	model: string
	ttl: number
}

export type WebsocketDeviceConnectionShadowInfo = WebsocketDeviceConnection & {
	version?: number
	count?: number
	updatedAt?: string
}

/**
 * Stores websocket connections listening for device messages
 */
export const connectionsRepository: (
	db: DynamoDBClient,
	tableName: string,
) => {
	add: (connection: WebsocketDeviceConnection) => Promise<void>
	extendTTL: (connectionId: string) => Promise<void>
	getAll: () => Promise<WebsocketDeviceConnectionShadowInfo[]>
	updateDeviceVersion: (
		connectionId: string,
		version: number,
		executionTime: Date,
	) => Promise<boolean>
} = (db: DynamoDBClient, tableName: string) => ({
	add: async (connection) => {
		await db.send(
			new PutItemCommand({
				TableName: tableName,
				Item: marshall(connection),
			}),
		)
	},
	extendTTL: async (connectionId) => {
		await db.send(
			new UpdateItemCommand({
				TableName: tableName,
				Key: {
					connectionId: {
						S: connectionId,
					},
				},
				UpdateExpression: 'SET #ttl = :ttl',
				ExpressionAttributeNames: {
					'#ttl': 'ttl',
				},
				ExpressionAttributeValues: {
					':ttl': { N: `${Math.round(Date.now() / 1000) + 5 * 60}` },
				},
			}),
		)
	},
	getAll: async () => {
		const connections: WebsocketDeviceConnectionShadowInfo[] = []
		let lastKey: Record<string, AttributeValue> | undefined = undefined

		do {
			const {
				Items,
				LastEvaluatedKey,
			}: {
				Items?: Record<string, AttributeValue>[]
				LastEvaluatedKey?: Record<string, AttributeValue>
			} = await db.send(
				new ScanCommand({
					TableName: tableName,
					ExclusiveStartKey: lastKey,
					FilterExpression: '#ttl > :now',
					ExpressionAttributeNames: {
						'#ttl': 'ttl',
					},
					ExpressionAttributeValues: {
						':now': {
							N: Math.floor(Date.now() / 1000).toString(),
						},
					},
				}),
			)

			connections.push(
				...((Items ?? []).map((item) =>
					unmarshall(item),
				) as WebsocketDeviceConnectionShadowInfo[]),
			)

			lastKey = LastEvaluatedKey
		} while (lastKey !== undefined)

		return connections
	},
	updateDeviceVersion: async (
		connectionId: string,
		version: number,
		executionTime: Date,
	): Promise<boolean> => {
		try {
			const result = await db.send(
				new UpdateItemCommand({
					TableName: tableName,
					Key: {
						connectionId: { S: connectionId },
					},
					UpdateExpression:
						'SET #version = :version, #updatedAt = :updatedAt ADD #count :increase',
					ExpressionAttributeNames: {
						'#version': 'version',
						'#updatedAt': 'updatedAt',
						'#count': 'count',
					},
					ExpressionAttributeValues: {
						':version': { N: version.toString() },
						':updatedAt': { S: executionTime.toISOString() },
						':increase': { N: '1' },
					},
					ConditionExpression:
						'attribute_not_exists(#version) OR #version <= :version',
					ReturnValues: 'ALL_OLD',
				}),
			)

			return version > parseInt(result.Attributes?.version?.N ?? '0', 10)
		} catch (error) {
			if (error instanceof ConditionalCheckFailedException) {
				return false
			}

			throw error
		}
	},
})
