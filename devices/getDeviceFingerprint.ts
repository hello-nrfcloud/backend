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
	): Promise<{ error: Error } | { fingerprint: string; account: string }> => {
		const { Items } = await db.send(
			new QueryCommand({
				TableName: devicesTableName,
				KeyConditionExpression: '#deviceId = :deviceId',
				ExpressionAttributeNames: {
					'#deviceId': 'deviceId',
					'#fingerprint': 'fingerprint',
					'#account': 'account',
				},
				ExpressionAttributeValues: {
					':deviceId': {
						S: deviceId,
					},
				},
				ProjectionExpression: '#fingerprint, #account',
				Limit: 1,
			}),
		)

		if (Items?.[0] === undefined) {
			return { error: new Error(`Unknown device ${deviceId}`) }
		} else {
			const data = unmarshall(Items[0])
			return {
				fingerprint: data.fingerprint,
				account: data.account,
			}
		}
	}
