import {
	type DynamoDBClient,
	BatchGetItemCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import { chunk } from 'lodash-es'
import type { Device } from './device.ts'
import { toDevice } from './getDeviceById.ts'

export const getByDeviceIds =
	({
		db,
		DevicesTableName,
	}: {
		db: DynamoDBClient
		DevicesTableName: string
	}) =>
	async (
		deviceIds: Array<string>,
	): Promise<
		Record<
			string,
			| {
					device: Device
			  }
			| { error: Error }
		>
	> => {
		const result: Record<string, { device: Device } | { error: Error }> = {}

		for (const page of chunk(deviceIds, 100)) {
			const res = await db.send(
				new BatchGetItemCommand({
					RequestItems: {
						[DevicesTableName]: {
							Keys: page.map((deviceId) => marshall({ deviceId })),
						},
					},
				}),
			)

			if (res.Responses?.[DevicesTableName] === undefined) continue

			for (const item of res.Responses[DevicesTableName]) {
				const device = toDevice(item)
				result[device.id] = { device }
			}
		}

		return result
	}
