import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { chunk } from 'lodash-es'
import pLimit from 'p-limit'
import { deviceShadowFetcher } from '../nrfcloud/getDeviceShadowFromnRFCloud.js'
import { defaultApiEndpoint } from '../nrfcloud/settings.js'
import { createDeviceShadowPublisher } from '../websocket/deviceShadowPublisher.js'
import { createDeviceUpdateChecker } from '../websocket/deviceShadowUpdateChecker.js'
import { createLock } from '../websocket/lock.js'
import {
	websocketDeviceConnectionsRepository,
	type WebsocketDeviceConnection,
} from '../websocket/websocketDeviceConnectionsRepository.js'
import { getNRFCloudSSMParameters } from './util/getSSMParameter.js'
import { logger } from './util/logger.js'

const metrics = new Metrics({
	namespace: 'muninn-backend',
	serviceName: 'shadowFetcher',
})

const {
	websocketDeviceConnectionsTableName,
	websocketDeviceConnectionsTableIndexName,
	lockTableName,
	eventBusName,
	stackName,
} = fromEnv({
	stackName: 'STACK_NAME',
	websocketDeviceConnectionsTableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
	websocketDeviceConnectionsTableIndexName:
		'WEBSOCKET_CONNECTIONS_TABLE_INDEX_NAME',
	lockTableName: 'LOCK_TABLE_NAME',
	eventBusName: 'EVENTBUS_NAME',
})(process.env)

const limit = pLimit(3)
const db = new DynamoDBClient({})
const log = logger('fetchDeviceShadow')

const lockName = 'fetch-shadow'
const lockTTLSeconds = 30
const lock = createLock(db, lockTableName)

const connectionsRepo = websocketDeviceConnectionsRepository(
	db,
	websocketDeviceConnectionsTableName,
	websocketDeviceConnectionsTableIndexName,
)
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

export const handler = async (): Promise<void> => {
	const lockAcquired = await lock.acquiredLock(lockName, lockTTLSeconds)
	if (lockAcquired === false) {
		log.info(`Other process is still running, then ignore`)
		return
	}
	const deviceShadow = await deviceShadowPromise
	const executionTime = new Date()

	try {
		const connections = await connectionsRepo.getAll()
		log.info(`Found ${connections.length} active connections`)
		metrics.addMetric('connections', MetricUnits.Count, connections.length)
		if (connections.length === 0) return

		// Filter based on the configuration
		const deviceShadowUpdateChecker = await createDeviceUpdateChecker(
			executionTime,
		)
		const devices = connections.filter((connection) => {
			const shouldUpdate = deviceShadowUpdateChecker({
				model: connection.model,
				updatedAt: connection.updatedAt,
				count: connection.count ?? 0,
			})

			return shouldUpdate
		})
		log.info(`Found ${devices.length} devices to get shadow`)

		const deviceConnectionsMap = connections.reduce(
			(map, connection) => ({
				[connection.deviceId]: [
					...(map[connection.deviceId] ?? []),
					connection,
				],
			}),
			{} as Record<string, WebsocketDeviceConnection[]>,
		)

		// Bulk fetching device shadow to avoid rate limit
		const deviceShadows = (
			await Promise.all(
				chunk(devices, 50).map(async (devices) =>
					limit(async () =>
						deviceShadow(devices.map((device) => device.deviceId)),
					),
				),
			)
		).flat()

		for (const deviceShadow of deviceShadows) {
			// In case multiple web sockets per device
			const connections = deviceConnectionsMap[deviceShadow.id]
			for (const d of connections ?? []) {
				log.info(`Checking shadow version`, {
					deviceId: d.deviceId,
					deviceVersion: d.version,
					model: d.model,
					shadowVersion: deviceShadow.state.version,
					isChanged: d.version !== deviceShadow.state.version,
				})
				const isUpdated = await connectionsRepo.updateDeviceVersion(
					d.deviceId,
					d.connectionId,
					deviceShadow.state.version,
					executionTime,
				)
				if (isUpdated === true) {
					metrics.addMetric('shadowUpdated', MetricUnits.Count, 1)
					await deviceShadowPublisher(d, deviceShadow)
				}
			}
		}
	} finally {
		await lock.releaseLock(lockName)
	}
}
