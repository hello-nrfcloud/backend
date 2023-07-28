import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { getModelForDevice } from '../devices/getModelForDevice.js'
import { logger } from './util/logger.js'

const log = logger('deviceModelCache')

/**
 * Fetch model for device
 *
 * @throws Error in case the model cannot be determined
 */
export const getDeviceModelById = ({
	db,
	DevicesTableName,
}: {
	db: DynamoDBClient
	DevicesTableName: string
}): ((deviceId: string) => Promise<string>) => {
	const modelFetcher = getModelForDevice({ db, DevicesTableName })
	const deviceModelCache: Record<string, string> = {}

	return async (deviceId: string) => {
		if (deviceModelCache[deviceId] === undefined) {
			const maybeModel = await modelFetcher(deviceId)
			if ('error' in maybeModel) {
				log.error(maybeModel.error.message)
				throw new Error(`Failed to determine model for device ${deviceId}!`)
			} else {
				deviceModelCache[deviceId] = maybeModel.model
			}
		}
		log.debug('model', {
			deviceId,
			model: deviceModelCache[deviceId],
		})
		return deviceModelCache[deviceId] as string
	}
}
