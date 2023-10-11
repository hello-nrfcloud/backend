import { logMetrics, MetricUnits } from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridgeClient } from '@aws-sdk/client-eventbridge'
import { SSMClient } from '@aws-sdk/client-ssm'
import { getShadowUpdateTime } from '@hello.nrfcloud.com/proto/nrfCloud'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { chunk, groupBy, once, uniqBy } from 'lodash-es'
import pLimit from 'p-limit'
import { getAllAccountsSettings } from '../nrfcloud/allAccounts.js'
import { store } from '../nrfcloud/deviceShadowRepo.js'
import { deviceShadowFetcher } from '../nrfcloud/getDeviceShadowFromnRFCloud.js'
import { defaultApiEndpoint } from '../nrfcloud/settings.js'
import {
	connectionsRepository,
	type WebsocketDeviceConnectionShadowInfo,
} from '../websocket/connectionsRepository.js'
import { createDeviceUpdateChecker } from '../websocket/deviceShadowUpdateChecker.js'
import { createLock } from '../websocket/lock.js'
import { metricsForComponent } from './metrics/metrics.js'
import { logger } from './util/logger.js'
import { sendShadowToConnection } from './ws/sendShadowToConnection.js'

const { track, metrics } = metricsForComponent('shadowFetcher')

const {
	websocketDeviceConnectionsTableName,
	lockTableName,
	eventBusName,
	stackName,
	deviceShadowTableName,
} = fromEnv({
	stackName: 'STACK_NAME',
	websocketDeviceConnectionsTableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
	lockTableName: 'LOCK_TABLE_NAME',
	eventBusName: 'EVENTBUS_NAME',
	deviceShadowTableName: 'DEVICE_SHADOW_TABLE_NAME',
})(process.env)

const limit = pLimit(3)
const db = new DynamoDBClient({})
const log = logger('fetchDeviceShadow')

const lockName = 'fetch-shadow'
const lockTTLSeconds = 5
const lock = createLock(db, lockTableName)

const eventBus = new EventBridgeClient({})

const connectionsRepo = connectionsRepository(
	db,
	websocketDeviceConnectionsTableName,
)

const ssm = new SSMClient({})

// Make sure to call it in the handler, so the AWS Parameters and Secrets Lambda Extension is ready.
const getAllNRFCloudAccountSettings = once(
	getAllAccountsSettings({
		ssm,
		stackName,
	}),
)
const getAllHealthCheckClientIds = once(async () => {
	const settings = await getAllNRFCloudAccountSettings()
	return Object.values(settings)
		.map((settings) => settings?.healthCheckSettings?.healthCheckClientId)
		.filter((x) => x !== undefined)
})

const send = sendShadowToConnection({
	eventBus,
	eventBusName,
	track,
	log,
})

const cacheShadow = store({ db, TableName: deviceShadowTableName })

const h = async (): Promise<void> => {
	try {
		const lockAcquired = await lock.acquiredLock(lockName, lockTTLSeconds)
		if (lockAcquired === false) {
			track('locked', MetricUnits.Count, 1)
			log.info(`Other process is still running, then ignore`)
			return
		}

		const allNRFCloudSettings = await getAllNRFCloudAccountSettings()
		const healthCheckClientIds = await getAllHealthCheckClientIds()

		const executionTime = new Date()

		const connections = await connectionsRepo.getAll()
		log.info(`Found ${connections.length} active connections`)
		track('connections', MetricUnits.Count, connections.length)

		if (connections.length === 0) return

		// Filter based on the configuration
		const deviceShadowUpdateChecker =
			await createDeviceUpdateChecker(executionTime)
		const devicesToCheckShadowUpdate = connections.filter((connection) => {
			// The health check device does not publish a valid shadow, so do not fetch it
			if (healthCheckClientIds.includes(connection.deviceId)) {
				console.debug(
					`Ignoring shadow request for health check device`,
					connection.deviceId,
				)
				return false
			}

			return deviceShadowUpdateChecker({
				model: connection.model,
				updatedAt: new Date(
					connection.updatedAt ?? executionTime.getTime() - 60 * 60 * 1000,
				),
				count: connection.count ?? 0,
			})
		})
		log.info(`Found ${devicesToCheckShadowUpdate.length} devices to get shadow`)
		if (devicesToCheckShadowUpdate.length === 0) return

		const deviceConnectionsMap = connections.reduce(
			(map, connection) => ({
				...map,
				[connection.deviceId]: [
					...(map[connection.deviceId] ?? []),
					connection,
				],
			}),
			{} as Record<string, WebsocketDeviceConnectionShadowInfo[]>,
		)

		// Bulk fetching device shadow to avoid rate limit
		const deviceShadows = (
			await Promise.all(
				Object.entries(
					groupBy(devicesToCheckShadowUpdate, (device) => device.account),
				).map(async ([account, devices]) => {
					const { apiKey, apiEndpoint } =
						allNRFCloudSettings[account]?.nrfCloudSettings ?? {}
					if (apiKey === undefined) return []

					const deviceShadow = deviceShadowFetcher({
						endpoint:
							apiEndpoint !== undefined
								? new URL(apiEndpoint)
								: defaultApiEndpoint,
						apiKey,
						onError: () => {
							track('error', MetricUnits.Count, 1)
						},
					})

					return (
						await Promise.all(
							chunk(
								uniqBy(devices, (device) => device.deviceId),
								50,
							).map(async (devices) =>
								limit(async () => {
									const start = Date.now()
									log.debug(
										`Prepare fetching shadow under ${account} account: ${devices.length} devices`,
									)
									const res = await deviceShadow(
										devices.map((device) => device.deviceId),
									)
									track(
										'apiResponseTime',
										MetricUnits.Milliseconds,
										Date.now() - start,
									)
									return res
								}),
							),
						)
					).flat()
				}),
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

				track(
					'shadowVersionDelta',
					MetricUnits.Count,
					deviceShadow.state.version - (d.version ?? 0),
				)

				const isUpdated = await connectionsRepo.updateDeviceVersion(
					d.connectionId,
					deviceShadow.state.version,
					executionTime,
				)

				if (!isUpdated) {
					track('shadowStale', MetricUnits.Count, 1)
					continue
				}

				track('shadowUpdated', MetricUnits.Count, 1)
				track(
					'shadowAge',
					MetricUnits.Seconds,
					Math.round(Date.now() / 1000) -
						getShadowUpdateTime(
							deviceShadow.state.metadata as Record<string, any>,
						),
				)

				log.info(
					`Sending device shadow of ${d.deviceId}(v.${
						d?.version ?? 0
					}) with shadow data version ${deviceShadow.state.version}`,
				)

				await send({ ...d, shadow: deviceShadow })
			}
		}

		await Promise.all(
			deviceShadows.map(async (deviceShadow) => {
				log.debug(`Caching shadow`, {
					deviceId: deviceShadow.id,
				})
				return cacheShadow(deviceShadow)
			}),
		)
	} catch (error) {
		log.error(`fetch device shadow error`, { error })
		track('error', MetricUnits.Count, 1)
	} finally {
		await lock.releaseLock(lockName)
	}
}

export const handler = middy(h).use(logMetrics(metrics))
