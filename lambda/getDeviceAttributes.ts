import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { getAttributesForDevice } from '../devices/getAttributesForDevice.js'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'

const log = logger('deviceModelCache')

type DeviceAttributes = {
	model: string
	account: string
}
/**
 * Fetch model for device
 *
 * @throws Error in case the model cannot be determined
 */
export const getDeviceAttributesById = ({
	db,
	DevicesTableName,
}: {
	db: DynamoDBClient
	DevicesTableName: string
}): ((deviceId: string) => Promise<DeviceAttributes>) => {
	const deviceFetcher = getAttributesForDevice({ db, DevicesTableName })
	const deviceCache: Record<string, DeviceAttributes> = {}

	return async (deviceId: string) => {
		if (deviceCache[deviceId] === undefined) {
			const maybeAttributes = await deviceFetcher(deviceId)
			if ('error' in maybeAttributes) {
				log.error(maybeAttributes.error.message)
				throw new Error(`Failed to determine model for device ${deviceId}!`)
			} else {
				deviceCache[deviceId] = maybeAttributes
			}
		}
		log.debug('device attributes', {
			deviceId,
			...deviceCache[deviceId],
		})
		return deviceCache[deviceId] as DeviceAttributes
	}
}
