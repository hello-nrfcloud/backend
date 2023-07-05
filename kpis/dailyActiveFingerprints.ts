import { QueryCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb'

export const dailyActiveFingerprints =
	(db: DynamoDBClient, TableName: string) =>
	async (forDay: Date): Promise<number> =>
		(
			await db.send(
				new QueryCommand({
					TableName,
					IndexName: 'dailyActive',
					KeyConditionExpression: '#source = :source AND #day = :today',
					ExpressionAttributeNames: {
						'#source': 'dailyActive__source',
						'#day': 'dailyActive__day',
						'#deviceId': 'deviceId',
					},
					ExpressionAttributeValues: {
						':source': {
							S: 'websocketAuthorizer',
						},
						':today': {
							S: forDay.toISOString().slice(0, 10),
						},
					},
					ProjectionExpression: '#deviceId',
				}),
			)
		).Count ?? 0
