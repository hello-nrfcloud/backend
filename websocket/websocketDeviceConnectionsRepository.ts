import {
	AttributeValue,
	ConditionalCheckFailedException,
	ScanCommand,
	UpdateItemCommand,
	type DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import type { PersistedDeviceSubscription } from '../lambda/onWebsocketConnectOrDisconnect'

export type WebsocketDeviceConnection = {
	deviceId: string
	connectionId: string
	model: string
	version?: number
	count?: number
	updatedAt: Date
}

/**
 * Stores websocket connections listening for device messages
 */
export const websocketDeviceConnectionsRepository: (
	db: DynamoDBClient,
	tableName: string,
) => {
	getAll: () => Promise<WebsocketDeviceConnection[]>
	updateDeviceVersion: (
		deviceId: string,
		connectionId: string,
		version: number,
	) => Promise<boolean>
} = (db: DynamoDBClient, tableName: string) => {
	const getAll = async () => {
		const devices: WebsocketDeviceConnection[] = []
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
	}

	const updateDeviceVersion = async (
		deviceId: string,
		connectionId: string,
		version: number,
	): Promise<boolean> => {
		try {
			await db.send(
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
						':updatedAt': { S: new Date().toISOString() },
						':increase': { N: '1' },
					},
					ConditionExpression:
						'attribute_not_exists(#version) OR :version > #version',
				}),
			)

			return true
		} catch (error) {
			if (error instanceof ConditionalCheckFailedException) {
				return false
			}

			throw error
		}
	}

	return {
		getAll,
		updateDeviceVersion,
	}
}
