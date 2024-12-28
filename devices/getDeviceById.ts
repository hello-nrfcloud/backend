import { GetItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import type { Device } from './device.ts'

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
			if (res.Item === undefined)
				return {
					error: new DeviceNotFoundError(deviceId),
				}

			return {
				device: toDevice(res.Item),
			}
		} catch (error) {
			return {
				error: error as Error,
			}
		}
	}

export const toDevice = (item: Record<string, any>): Device => {
	const {
		deviceId: id,
		model,
		account,
		fingerprint,
		hideDataBefore,
	} = unmarshall(item)
	const device: Device = {
		id,
		fingerprint,
		model,
		account,
	}
	if (hideDataBefore !== undefined) {
		device.hideDataBefore = new Date(hideDataBefore)
	}
	return device
}

export class DeviceNotFoundError extends Error {
	public readonly id: string
	constructor(id: string) {
		super(`Device with ID ${id} not found.`)
		this.id = id
		this.name = 'DeviceNotFoundError'
	}
}
