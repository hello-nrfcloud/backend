import { QueryCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb'

export const dailyActiveDevices =
	(db: DynamoDBClient, TableName: string) =>
	async (forDay: Date): Promise<number> =>
		(
			await db.send(
				new QueryCommand({
					TableName,
					IndexName: 'dailyActive',
					KeyConditionExpression: '#source = :source AND #day = :today',
					ExpressionAttributeNames: {
						'#source': 'source',
						'#day': 'day',
						'#deviceId': 'deviceId',
					},
					ExpressionAttributeValues: {
						':source': {
							S: 'deviceMessage',
						},
						':today': {
							S: forDay.toISOString().slice(0, 10),
						},
					},
					ProjectionExpression: '#deviceId',
				}),
			)
		).Count ?? 0
