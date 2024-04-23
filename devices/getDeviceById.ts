import { GetItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import type { Device } from './device.js'

export const getDeviceById =
	({
		db,
		DevicesTableName,
	}: {
		db: DynamoDBClient
		DevicesTableName: string
	}) =>
	async (
		deviceId: string,
	): Promise<
		| {
				device: Device
		  }
		| { error: Error }
	> => {
		try {
			const res = await db.send(
				new GetItemCommand({
					TableName: DevicesTableName,
					Key: marshall({ deviceId }),
				}),
			)
			if (res.Item === undefined) throw new Error(`not_found`)

			const { deviceId: id, model, account, fingerprint } = unmarshall(res.Item)
			return {
				device: {
					id,
					fingerprint,
					model,
					account,
				},
			}
		} catch {
			return {
				error: new Error(`Device with ID ${deviceId} not found.`),
			}
		}
	}
