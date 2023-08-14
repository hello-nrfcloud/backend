import {
	DynamoDBClient,
	GetItemCommand,
	PutItemCommand,
} from '@aws-sdk/client-dynamodb'
import { cellId } from './cellId.js'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'

export const get =
	({ db, TableName }: { db: DynamoDBClient; TableName: string }) =>
	async (
		cell: Parameters<typeof cellId>[0],
	): Promise<{ lat: number; lng: number; accuracy: number } | null> => {
		try {
			const { Item } = await db.send(
				new GetItemCommand({
					TableName,
					Key: {
						cellId: {
							S: cellId(cell),
						},
					},
				}),
			)
			const { lat, lng, accuracy } = unmarshall(
				Item as Record<string, never>,
			) as {
				lat: number
				lng: number
				accuracy: number
			}
			return { lat, lng, accuracy }
		} catch {
			return null
		}
	}

export const store =
	({ db, TableName }: { db: DynamoDBClient; TableName: string }) =>
	async (
		cell: Parameters<typeof cellId>[0],
		location: { lat: number; lng: number; accuracy: number },
	): Promise<void> => {
		await db.send(
			new PutItemCommand({
				TableName,
				Item: marshall({
					cellId: cellId(cell),
					...location,
					ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
				}),
			}),
		)
	}
