import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import pLimit from 'p-limit'
import { defaultApiEndpoint } from '../nrfcloud/settings.js'
import { createDeviceShadowPublisher } from './deviceShadowPublisher.js'
import { createDevicesRepository } from './devicesRepository.js'
import { deviceShadowFetcher } from './getDeviceShadowFromnRFCloud.js'
import { getNRFCloudSSMParameters } from './getSSMParameter.js'
import { createLock } from './lock.js'
import { logger } from './logger.js'

const metrics = new Metrics({
	namespace: 'muninn-backend',
	serviceName: 'shadowFetcher',
})

const { devicesTable, lockTable, eventBusName, stackName } = fromEnv({
	stackName: 'STACK_NAME',
	devicesTable: 'DEVICES_TABLE',
	lockTable: 'LOCK_TABLE',
	eventBusName: 'EVENTBUS_NAME',
})(process.env)

const limit = pLimit(3)
const db = new DynamoDBClient({})
const log = logger('fetchDeviceShadow')

const lockName = 'fetch-shadow'
const lockTTL = 30
const lock = createLock(db, lockTable)

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

	try {
		const devices = await deviceRepository.getAll()
		log.info(`Found ${devices.length} active devices`)
		metrics.addMetric('deviceSubscriptions', MetricUnits.Count, devices.length)
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
