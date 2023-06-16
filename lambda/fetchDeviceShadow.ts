import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { chunk } from 'lodash-es'
import pLimit from 'p-limit'
import { deviceShadowFetcher } from '../nrfcloud/getDeviceShadowFromnRFCloud.js'
import { defaultApiEndpoint } from '../nrfcloud/settings.js'
import { createDeviceShadowPublisher } from '../websocket/deviceShadowPublisher.js'
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
	lockTableName,
	eventBusName,
	stackName,
} = fromEnv({
	stackName: 'STACK_NAME',
	websocketDeviceConnectionsTableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
	lockTableName: 'LOCK_TABLE_NAME',
	eventBusName: 'EVENTBUS_NAME',
})(process.env)

const limit = pLimit(3)
const db = new DynamoDBClient({})
const log = logger('fetchDeviceShadow')

const lockName = 'fetch-shadow'
const lockTTL = 30
const lock = createLock(db, lockTableName)

const connectionsRepo = websocketDeviceConnectionsRepository(
	db,
	websocketDeviceConnectionsTableName,
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
	const deviceShadow = await deviceShadowPromise
	const lockAcquired = await lock.acquiredLock(lockName, lockTTL)
	if (lockAcquired === false) {
		log.info(`Other process is still running, then ignore`)
		return
	}

	try {
		const connections = await connectionsRepo.getAll()
		log.info(`Found ${connections.length} active connections`)
		metrics.addMetric('connections', MetricUnits.Count, connections.length)
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
				chunk(connections, 50).map(async (devices) =>
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
				)
				if (isUpdated === true) {
					await deviceShadowPublisher(d, deviceShadow)
				}
			}
		}
	} finally {
		await lock.releaseLock(lockName)
	}
}
