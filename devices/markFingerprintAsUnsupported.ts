import { PutItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'

export const markFingerprintAsUnsupported =
	({
		db,
		devicesTableName,
	}: {
		db: DynamoDBClient
		devicesTableName: string
	}) =>
	async ({
		fingerprint,
		deviceId,
	}: {
		fingerprint: string
		deviceId: string
	}): Promise<{ success: true } | { error: Error }> => {
		try {
			await db.send(
				new PutItemCommand({
					TableName: devicesTableName,
					Item: marshall({
						fingerprint,
						deviceId,
						model: 'unsupported',
					}),
					ConditionExpression: 'attribute_not_exists(fingerprint)',
				}),
			)
			return { success: true }
		} catch (error) {
			return { error: error as Error }
		}
	}
