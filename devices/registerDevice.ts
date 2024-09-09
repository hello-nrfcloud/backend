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
		account,
		hwVersion,
	}: {
		id: string
		model: string
		fingerprint: string
		account: string
		hwVersion: string
	}): Promise<{ success: true } | { error: Error }> => {
		try {
			await db.send(
				new PutItemCommand({
					TableName: devicesTableName,
					Item: marshall({
						deviceId: id,
						fingerprint,
						model,
						account,
						hwVersion,
					}),
					ConditionExpression:
						'attribute_not_exists(deviceId) and attribute_not_exists(fingerprint)',
				}),
			)
			return { success: true }
		} catch (error) {
			return { error: error as Error }
		}
	}
