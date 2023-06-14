import { PutItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'

export const registerDevice =
	({
		db,
		devicesTableName,
	}: {
		db: DynamoDBClient
		devicesTableName: string
	}) =>
	async ({
		id,
		model,
		fingerprint,
	}: {
		id: string
		model: string
		fingerprint: string
	}): Promise<{ success: true } | { error: Error }> => {
		try {
			await db.send(
				new PutItemCommand({
					TableName: devicesTableName,
					Item: marshall({
						deviceId: id,
						fingerprint,
						model,
					}),
					ConditionExpression: 'attribute_not_exists(deviceId)',
				}),
			)
			return { success: true }
		} catch (error) {
			return { error: error as Error }
		}
	}
