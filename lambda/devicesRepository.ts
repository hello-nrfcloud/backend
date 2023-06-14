import {
	AttributeValue,
	ConditionalCheckFailedException,
	QueryCommand,
	ScanCommand,
	UpdateItemCommand,
	type DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import type { PersistedDeviceSubscription } from './onWebsocketConnectOrDisconnect'

export type Device = {
	deviceId: string
	connectionId: string
	model: string
	version?: number
	count?: number
	updatedAt: Date
}

export const createDevicesRepository: (
	db: DynamoDBClient,
	tableName: string,
	indexName: string,
) => {
	getAll: () => Promise<Device[]>
	getWillUpdatedDevice: (threshold: Date) => Promise<Device[]>
	updateDevice: (
		deviceId: string,
		connectionId: string,
		version: number,
		executionTime: Date,
	) => Promise<boolean>
} = (db, tableName, indexName) => ({
	getAll: async () => {
		const devices: Device[] = []
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
				}),
			)

			for (const item of Items ?? []) {
				const device = unmarshall(item) as PersistedDeviceSubscription
				devices.push({
					...device,
					updatedAt: new Date(device.updatedAt),
				})
			}

			lastKey = LastEvaluatedKey
		} while (lastKey !== undefined)

		return devices
	},

	getWillUpdatedDevice: async (threshold) => {
		const staticKey = 'Muninn'
		const devices: Device[] = []
		let lastKey: Record<string, AttributeValue> | undefined = undefined

		do {
			const {
				Items,
				LastEvaluatedKey,
			}: {
				Items?: Record<string, AttributeValue>[]
				LastEvaluatedKey?: Record<string, AttributeValue>
			} = await db.send(
				new QueryCommand({
					TableName: tableName,
					IndexName: indexName,
					KeyConditionExpression:
						'#staticKey = :staticKey AND #updatedAt <= :updatedAt',
					ExpressionAttributeNames: {
						'#staticKey': 'staticKey',
						'#updatedAt': 'updatedAt',
					},
					ExpressionAttributeValues: {
						':staticKey': { S: staticKey },
						':updatedAt': { S: threshold.toISOString() },
					},
					ExclusiveStartKey: lastKey,
				}),
			)

			for (const item of Items ?? []) {
				const device = unmarshall(item) as PersistedDeviceSubscription
				devices.push({
					...device,
					updatedAt: new Date(device.updatedAt),
				})
			}

			lastKey = LastEvaluatedKey
		} while (lastKey !== undefined)

		return devices
	},

	updateDevice: async (
		deviceId: string,
		connectionId: string,
		version: number,
		executionTime: Date,
	): Promise<boolean> => {
		try {
			const result = await db.send(
				new UpdateItemCommand({
					TableName: tableName,
					Key: {
						deviceId: { S: deviceId },
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
