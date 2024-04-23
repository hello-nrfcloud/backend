import { QueryCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import type { Device } from './device.js'

export const getDeviceByFingerprint =
	({
		db,
		DevicesTableName,
		DevicesIndexName,
	}: {
		db: DynamoDBClient
		DevicesTableName: string
		DevicesIndexName: string
	}) =>
	async (
		fingerprint: string,
	): Promise<
		| {
				device: Device
		  }
		| { error: Error }
	> => {
		const res = await db.send(
			new QueryCommand({
				TableName: DevicesTableName,
				IndexName: DevicesIndexName,
				KeyConditionExpression: '#fingerprint = :fingerprint',
				ExpressionAttributeNames: {
					'#fingerprint': 'fingerprint',
				},
				ExpressionAttributeValues: {
					':fingerprint': {
						S: fingerprint,
					},
				},
			}),
		)
		if (res.Items?.[0] === undefined)
			return {
				error: new Error(`Device with fingerprint ${fingerprint} not found.`),
			}
		const { deviceId: id, model, account } = unmarshall(res.Items[0])
		return {
			device: {
				id,
				fingerprint,
				model,
				account,
			},
		}
	}
