import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'

export const getDeviceFingerprint =
	({
		db,
		devicesTableName,
	}: {
		db: DynamoDBClient
		devicesTableName: string
	}) =>
	async (
		deviceId: string,
	): Promise<{ error: Error } | { fingerprint: string }> => {
		const { Items } = await db.send(
			new QueryCommand({
				TableName: devicesTableName,
				KeyConditionExpression: '#deviceId = :deviceId',
				ExpressionAttributeNames: {
					'#deviceId': 'deviceId',
					'#fingerprint': 'fingerprint',
				},
				ExpressionAttributeValues: {
					':deviceId': {
						S: deviceId,
					},
				},
				ProjectionExpression: '#fingerprint',
				Limit: 1,
			}),
		)

		return Items?.[0] === undefined
			? { error: new Error(`Unknown device ${deviceId}`) }
			: {
					fingerprint: unmarshall(Items[0]).fingerprint,
			  }
	}
