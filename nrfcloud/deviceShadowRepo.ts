import {
	GetItemCommand,
	PutItemCommand,
	type DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import type { DeviceShadow } from './DeviceShadow'

/**
 * Store the updated shadow in DynamoDB for sending it right after a client connects
 */
export const store =
	({
		db,
		TableName,
	}: {
		db: DynamoDBClient
		TableName: string
	}): ((shadow: DeviceShadow) => Promise<void>) =>
	async (shadow) => {
		await db.send(
			new PutItemCommand({
				TableName,
				Item: marshall({
					deviceId: shadow.id,
					shadow,
					// Discard after 30 days
					ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
				}),
			}),
		)
	}

export const get =
	({
		db,
		TableName,
	}: {
		db: DynamoDBClient
		TableName: string
	}): ((deviceId: string) => Promise<{ shadow: DeviceShadow | null }>) =>
	async (deviceId) => {
		try {
			const { Item } = await db.send(
				new GetItemCommand({
					TableName,
					Key: {
						deviceId: {
							S: deviceId,
						},
					},
				}),
			)
			const { shadow } = unmarshall(Item as Record<string, never>) as {
				shadow: DeviceShadow
			}
			return { shadow }
		} catch {
			return { shadow: null }
		}
	}
