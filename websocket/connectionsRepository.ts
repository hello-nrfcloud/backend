import {
	ConditionalCheckFailedException,
	paginateScan,
	PutItemCommand,
	UpdateItemCommand,
	type DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'

export type WebsocketDeviceConnection = {
	deviceId: string
	connectionId: string
	model: string
	account: string
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
				ConditionExpression: 'attribute_exists(#connectionId)',
				ExpressionAttributeNames: {
					'#ttl': 'ttl',
					'#connectionId': 'connectionId',
				},
				ExpressionAttributeValues: {
					':ttl': { N: `${Math.round(Date.now() / 1000) + 5 * 60}` },
				},
			}),
		)
	},
	getAll: async () => {
		const connections: Array<WebsocketDeviceConnectionShadowInfo> = []
		const results = paginateScan(
			{ client: db },
			{
				TableName: tableName,
				FilterExpression: '#ttl > :now',
				ExpressionAttributeNames: {
					'#ttl': 'ttl',
					'#deviceId': 'deviceId',
					'#connectionId': 'connectionId',
					'#model': 'model',
					'#account': 'account',
					'#version': 'version',
					'#count': 'count',
					'#updatedAt': 'updatedAt',
				},
				ExpressionAttributeValues: {
					':now': {
						N: Math.floor(Date.now() / 1000).toString(),
					},
				},
				ProjectionExpression:
					'#ttl, #deviceId, #connectionId, #model, #account, #version, #count, #updatedAt',
			},
		)

		for await (const { Items } of results) {
			connections.push(
				...(Items ?? []).map(
					(item) => unmarshall(item) as WebsocketDeviceConnectionShadowInfo,
				),
			)
		}

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
						'#connectionId': 'connectionId',
					},
					ExpressionAttributeValues: {
						':version': { N: version.toString() },
						':updatedAt': { S: executionTime.toISOString() },
						':increase': { N: '1' },
					},
					ConditionExpression:
						'attribute_exists(#connectionId) AND (attribute_not_exists(#version) OR #version <= :version)',
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
