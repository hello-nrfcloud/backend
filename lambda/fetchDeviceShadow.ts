import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import pLimit from 'p-limit'
import { defaultApiEndpoint } from '../nrfcloud/settings.js'
import { createDeviceShadowPublisher } from './deviceShadowPublisher.js'
import { createDeviceUpdateChecker } from './deviceShadowUpdateChecker.js'
import { createDevicesRepository } from './devicesRepository.js'
import { deviceShadowFetcher } from './getDeviceShadowFromnRFCloud.js'
import { getNRFCloudSSMParameters } from './getSSMParameter.js'
import { createLock } from './lock.js'
import { logger } from './logger.js'

<<<<<<< HEAD
const { devicesTable, lockTable, eventBusName, stackName } = fromEnv({
	stackName: 'STACK_NAME',
	devicesTable: 'DEVICES_TABLE',
	lockTable: 'LOCK_TABLE',
=======
const {
	devicesTable,
	devicesIndexName,
	lockTable,
	nrfCloudEndpoint,
	apiKey,
	eventBusName,
} = fromEnv({
	devicesTable: 'DEVICES_TABLE',
	devicesIndexName: 'DEVICES_INDEX_NAME',
	lockTable: 'LOCK_TABLE',
	nrfCloudEndpoint: 'NRF_CLOUD_ENDPOINT',
	apiKey: 'API_KEY',
>>>>>>> 4b41af4 (feat: update fetching interval in run time)
	eventBusName: 'EVENTBUS_NAME',
})(process.env)

const limit = pLimit(3)
const db = new DynamoDBClient({})
const log = logger('fetchDeviceShadow')

const lockName = 'fetch-shadow'
const lockTTL = 3 // seconds
const lock = createLock(db, lockTable)

<<<<<<< HEAD
const deviceRepository = createDevicesRepository(db, devicesTable)
const deviceShadowPromise = (async () => {
	const [apiKey, apiEndpoint] = await getNRFCloudSSMParameters(stackName, [
		'apiKey',
		'apiEndpoint',
	])
	if (apiKey === undefined)
		throw new Error(`nRF Cloud API key for ${stackName} is not configured.`)
	return deviceShadowFetcher({
		endpoint:
			apiEndpoint !== undefined ? new URL(apiEndpoint) : defaultApiEndpoint,
		apiKey,
	})
})()
=======
const deviceRepository = createDevicesRepository(
	db,
	devicesTable,
	devicesIndexName,
)
const deviceShadow = deviceShadowFetcher({
	endpoint: nrfCloudEndpoint,
	apiKey,
})
>>>>>>> 4b41af4 (feat: update fetching interval in run time)
const deviceShadowPublisher = createDeviceShadowPublisher(eventBusName)

const chunkArray = <T>(arr: T[], size: number): T[][] => {
	const chunkedArr = []

	for (let i = 0; i < arr.length; i += size) {
		chunkedArr.push(arr.slice(i, i + size))
	}

	return chunkedArr
}

const convertToMap = <T extends { [key: string]: unknown }, K extends keyof T>(
	arr: T[],
	key: K,
): Record<string, T[]> => {
	const map: { [key: string]: T[] } = {}
	for (const obj of arr) {
		const k = obj[key] as string

		if (map[k] === undefined) {
			map[k] = [obj]
		} else {
			map[k]?.push(obj)
		}
	}

	return map
}

export const handler = async (): Promise<void> => {
	const deviceShadow = await deviceShadowPromise
	const lockAcquired = await lock.acquiredLock(lockName, lockTTL)
	if (lockAcquired === false) {
		log.info(`Other process is still running, then ignore`)
		return
	}
	const executionTime = new Date()

	try {
		const onlineDevices = await deviceRepository.getAll()
		log.info(`Found ${onlineDevices.length} online devices`)
		if (onlineDevices.length === 0) return

		// Filter based on the configuration
		const deviceShadowUpdateChecker = await createDeviceUpdateChecker(
			executionTime,
		)
		const devices = onlineDevices.filter((device) => {
			const shouldUpdate = deviceShadowUpdateChecker({
				model: device.model,
				updatedAt: device.updatedAt,
				count: device.count ?? 0,
			})

			return shouldUpdate
		})
		log.info(`Found ${devices.length} devices to get shadow`)
		const devicesMap = convertToMap(devices, 'deviceId')

		// Bulk fetching device shadow to avoid rate limit
		const chunkedDevices = chunkArray(devices, 50)
		const shadows = (
			await Promise.all(
				chunkedDevices.map(async (devices) =>
					limit(async () =>
						deviceShadow(devices.map((device) => device.deviceId)),
					),
				),
			)
		).flat()

		for (const shadow of shadows) {
			// In case multiple web sockets per device
			const device = devicesMap[shadow.id]
			for (const d of device ?? []) {
				log.info(`Checking shadow version`, {
					deviceId: d.deviceId,
					deviceVersion: d.version,
					model: d.model,
					shadowVersion: shadow.state.version,
					isChanged: d.version !== shadow.state.version,
				})
				const isUpdated = await deviceRepository.updateDevice(
					d.deviceId,
					d.connectionId,
					shadow.state.version,
					executionTime,
				)
				if (isUpdated === true) {
					await deviceShadowPublisher(d, shadow)
				}
			}
		}
	} finally {
		await lock.releaseLock(lockName)
	}
}
