import { QueryCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import type { Device } from './getDevice.js'

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
	async (fingerprint: string): Promise<null | Device> => {
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
		if (res.Items?.[0] === undefined) return null
		const { deviceId: id, model, account } = unmarshall(res.Items[0])
		return {
			id,
			fingerprint,
			model,
			account,
		}
	}
