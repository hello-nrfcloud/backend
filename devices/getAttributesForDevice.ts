import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'

export const getAttributesForDevice =
	({
		db,
		DevicesTableName,
	}: {
		db: DynamoDBClient
		DevicesTableName: string
	}) =>
	async (
		deviceId: string,
	): Promise<{ model: string; account: string } | { error: Error }> => {
		const { Items } = await db.send(
			new QueryCommand({
				TableName: DevicesTableName,
				KeyConditionExpression: '#deviceId = :deviceId',
				ExpressionAttributeNames: {
					'#deviceId': 'deviceId',
					'#model': 'model',
					'#account': 'account',
				},
				ExpressionAttributeValues: {
					':deviceId': {
						S: deviceId,
					},
				},
				ProjectionExpression: '#model, #account',
			}),
		)

		const attributes = unmarshall(Items?.[0] ?? {})
		const { model, account } = attributes

		if (model === undefined)
			return {
				error: new Error(`No model defined for device ${deviceId}!`),
			}
		if (account === undefined)
			return {
				error: new Error(`No account defined for device ${deviceId}!`),
			}

		return { model, account }
	}
