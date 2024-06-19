import {
	UpdateItemCommand,
	type DynamoDBClient,
} from '@aws-sdk/client-dynamodb'

/**
 * Details about the sync status of device's Memfault reboot history
 */
export const memfaultRebootSyncRepository: (
	db: DynamoDBClient,
	tableName: string,
	maxHistoryHours: number,
) => {
	/**
	 * Returns the Date from which the reboot history should be fetched and updates the value
	 */
	getAndUpdateFrom: (deviceId: string) => Promise<{ since: Date }>
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

		return {
			since:
				res.Attributes?.lastFetchTime?.S !== undefined
					? new Date(res.Attributes.lastFetchTime.S)
					: new Date(Date.now() - maxHistoryHours * 60 * 60 * 1000),
		}
	},
})
