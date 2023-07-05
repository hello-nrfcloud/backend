import { GetItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb'

export const lastSeenRepo = (
	db: DynamoDBClient,
	TableName: string,
): {
	getLastSeen: (
		deviceId: string,
	) => Promise<{ error: Error } | { lastSeen: Date | null }>
	getLastSeenOrNull: (deviceId: string) => Promise<Date | null>
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
		getLastSeenOrNull: async (deviceId: string): Promise<Date | null> => {
			const res = await getLastSeen(deviceId)
			return 'lastSeen' in res ? res.lastSeen : null
		},
	}
}
