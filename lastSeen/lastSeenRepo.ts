import {
	BatchGetItemCommand,
	GetItemCommand,
	type DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'

export const lastSeenRepo = (
	db: DynamoDBClient,
	TableName: string,
): {
	getLastSeen: (
		deviceId: string,
	) => Promise<{ error: Error } | { lastSeen: Date | null }>
	getLastSeenOrNull: (deviceId: string) => Promise<Date | null>
	getLastSeenBatch: (
		deviceIds: Array<string>,
	) => Promise<Record<string, Date | null>>
} => {
	const getLastSeen = async (
		deviceId: string,
	): Promise<{ error: Error } | { lastSeen: Date | null }> => {
		try {
			const { Item } = await db.send(
				new GetItemCommand({
					TableName,
					Key: {
						deviceId: {
							S: deviceId,
						},
						source: {
							S: 'deviceMessage',
						},
					},
					ProjectionExpression: '#lastSeen',
					ExpressionAttributeNames: {
						'#lastSeen': 'lastSeen',
					},
				}),
			)
			const lastSeen = Item?.lastSeen?.S
			return {
				lastSeen: lastSeen === undefined ? null : new Date(lastSeen),
			}
		} catch (err) {
			return { error: err as Error }
		}
	}

	return {
		getLastSeen,
		getLastSeenOrNull: async (deviceId) => {
			const res = await getLastSeen(deviceId)
			return 'lastSeen' in res ? res.lastSeen : null
		},
		getLastSeenBatch: async (deviceIds) => {
			const res = await db.send(
				new BatchGetItemCommand({
					RequestItems: {
						[TableName]: {
							Keys: deviceIds.map((deviceId) => ({
								deviceId: {
									S: deviceId,
								},
								source: {
									S: 'deviceMessage',
								},
							})),
							ProjectionExpression: '#deviceId, #lastSeen',
							ExpressionAttributeNames: {
								'#deviceId': 'deviceId',
								'#lastSeen': 'lastSeen',
							},
						},
					},
				}),
			)
			const results = (res.Responses?.[TableName] ?? []).map((Item) =>
				unmarshall(Item),
			)
			return deviceIds.reduce((result, id) => {
				const lastSeen = results.find(
					({ deviceId }) => deviceId === id,
				)?.lastSeen
				return {
					...result,
					[id]: lastSeen === undefined ? null : new Date(lastSeen),
				}
			}, {})
		},
	}
}
