import {
	UpdateItemCommand,
	type DynamoDBClient,
} from '@aws-sdk/client-dynamodb'

/**
 * Details about the sync status of device's location history
 */
export const locationHistorySyncRepository: (
	db: DynamoDBClient,
	tableName: string,
	maxHistoryHours: number,
) => {
	/**
	 * Returns the Date from which the location history should be fetched and updates the value
	 */
	getAndUpdateFrom: (deviceId: string) => Promise<{ from: Date; to: Date }>
} = (db: DynamoDBClient, tableName: string, maxHistoryHours: number) => ({
	getAndUpdateFrom: async (deviceId) => {
		const now = new Date()
		const res = await db.send(
			new UpdateItemCommand({
				TableName: tableName,
				Key: {
					deviceId: {
						S: deviceId,
					},
				},
				UpdateExpression: 'SET #lastFetchTime = :lastFetchTime',
				ExpressionAttributeNames: {
					'#lastFetchTime': 'lastFetchTime',
				},
				ExpressionAttributeValues: {
					':lastFetchTime': { S: now.toISOString() },
				},
				ReturnValues: 'UPDATED_OLD',
			}),
		)

		console.log(JSON.stringify(res))

		return {
			from:
				res.Attributes?.lastFetchTime?.S !== undefined
					? new Date(res.Attributes.lastFetchTime.S)
					: // Go back max 30 days
						new Date(Date.now() - maxHistoryHours * 60 * 60 * 1000),
			to: now,
		}
	},
})
