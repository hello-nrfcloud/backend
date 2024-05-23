import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { getDeviceById } from './getDeviceById.js'

export const getAttributesForDevice = ({
	db,
	DevicesTableName,
}: {
	db: DynamoDBClient
	DevicesTableName: string
}) => {
	const getDevice = getDeviceById({ db, DevicesTableName })
	return async (
		deviceId: string,
	): Promise<{ model: string; account: string } | { error: Error }> => {
		const maybeDevice = await getDevice(deviceId)
		if ('error' in maybeDevice) return maybeDevice
		const { model, account } = maybeDevice.device
		if (model === undefined)
			return {
				error: new Error(`No model defined for device ${deviceId}!`),
			}
		if (account === undefined)
			return {
				error: new Error(`No account defined for device ${deviceId}!`),
			}
		return { model, account }
	}
}
