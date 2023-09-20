import { PutItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'

export const UNSUPPORTED_MODEL = 'unsupported'

export const registerUnsupportedDevice =
	({
		db,
		devicesTableName,
	}: {
		db: DynamoDBClient
		devicesTableName: string
	}) =>
	async ({
		fingerprint,
		id,
	}: {
		fingerprint: string
		id: string
	}): Promise<{ success: true } | { error: Error }> => {
		try {
			await db.send(
				new PutItemCommand({
					TableName: devicesTableName,
					Item: marshall({
						fingerprint,
						deviceId: id,
						model: UNSUPPORTED_MODEL,
					}),
					ConditionExpression: 'attribute_not_exists(fingerprint)',
				}),
			)
			return { success: true }
		} catch (error) {
			return { error: error as Error }
		}
	}
