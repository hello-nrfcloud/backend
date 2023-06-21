import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'

export const getModelForDevice =
	({
		db,
		DevicesTableName,
	}: {
		db: DynamoDBClient
		DevicesTableName: string
	}) =>
	async (deviceId: string): Promise<{ model: string } | { error: Error }> => {
		const { Items } = await db.send(
			new QueryCommand({
				TableName: DevicesTableName,
				KeyConditionExpression: '#deviceId = :deviceId',
				ExpressionAttributeNames: {
					'#deviceId': 'deviceId',
					'#model': 'model',
				},
				ExpressionAttributeValues: {
					':deviceId': {
						S: deviceId,
					},
				},
				ProjectionExpression: '#model',
			}),
		)

		const model = Items?.[0] !== undefined && unmarshall(Items[0]).model

		if (model === undefined)
			return {
				error: new Error(`Not model defined for device ${deviceId}!`),
			}

		return { model }
	}
