import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridgeClient } from '@aws-sdk/client-eventbridge'
import { SSMClient } from '@aws-sdk/client-ssm'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { chunk, groupBy, once, uniqBy } from 'lodash-es'
import pLimit from 'p-limit'
import { store } from '../devices/deviceShadowRepo.js'
import { getDeviceShadow } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import {
	defaultApiEndpoint,
	getAllAccountsSettings as getAllNRFCloudAccountSettings,
	type Settings,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import {
	connectionsRepository,
	type WebsocketDeviceConnectionShadowInfo,
} from '../websocket/connectionsRepository.js'
import { createDeviceUpdateChecker } from '../websocket/deviceShadowUpdateChecker.js'
import { createLock } from '../websocket/lock.js'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { sendShadowToConnection } from './ws/sendShadowToConnection.js'
import { loggingFetch } from './loggingFetch.js'
import { getAllAccountsSettings } from '../settings/health-check/device.js'
import { shadowToObjects } from '../lwm2m/shadowToObjects.js'

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
const allNRFCloudAccountSettings = once(async () =>
	getAllNRFCloudAccountSettings({
		ssm,
		stackName,
	}),
)
const allHealthCheckClientIds = once(async () => {
	const settings = await getAllAccountsSettings({ ssm, stackName })
	return Object.values(settings).map((settings) => settings.healthCheckClientId)
})

const send = sendShadowToConnection({
	eventBus,
	eventBusName,
	log,
})

const cacheShadow = store({ db, TableName: deviceShadowTableName })

const h = async (): Promise<void> => {
	try {
		const lockAcquired = await lock.acquiredLock(lockName, lockTTLSeconds)
		if (lockAcquired === false) {
			track('locked', MetricUnit.Count, 1)
			log.info(`Other process is still running, then ignore`)
			return
		}

		const allNRFCloudSettings = await allNRFCloudAccountSettings()
		const healthCheckClientIds = await allHealthCheckClientIds()

		const executionTime = new Date()

		const connections = await connectionsRepo.getAll()
		log.info(`Found ${connections.length} active connections`)
		track('connections', MetricUnit.Count, connections.length)

		if (connections.length === 0) return

		// Filter based on the configuration
		const deviceShadowUpdateChecker = createDeviceUpdateChecker(executionTime)
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
		log.debug(JSON.stringify(devicesToCheckShadowUpdate))
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
					const { apiKey, apiEndpoint } = allNRFCloudSettings[
						account
					] as Settings
					if (apiKey === undefined) return []

					const deviceShadow = getDeviceShadow(
						{
							endpoint:
								apiEndpoint !== undefined
									? new URL(apiEndpoint)
									: defaultApiEndpoint,
							apiKey,
						},
						loggingFetch({ track, log }),
					)

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
										MetricUnit.Milliseconds,
										Date.now() - start,
									)
									if ('error' in res) {
										track('error', MetricUnit.Count, 1)
										log.error(`Fetching shadow error`, { error: res.error })
										return []
									}
									return res.shadows
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
					MetricUnit.Count,
					deviceShadow.state.version - (d.version ?? 0),
				)

				const isUpdated = await connectionsRepo.updateDeviceVersion(
					d.connectionId,
					deviceShadow.state.version,
					executionTime,
				)

				if (!isUpdated) {
					track('shadowStale', MetricUnit.Count, 1)
					continue
				}

				track('shadowUpdated', MetricUnit.Count, 1)
				track(
					'shadowAge',
					MetricUnit.Seconds,
					Math.round(Date.now() / 1000) -
						new Date((deviceShadow as any).$meta.updatedAt).getTime() / 1000,
				)

				log.info(
					`Sending device shadow of ${d.deviceId}(v.${
						d?.version ?? 0
					}) with shadow data version ${deviceShadow.state.version}`,
				)

				await send({
					...d,
					shadow: {
						desired: shadowToObjects(deviceShadow.state.desired?.lwm2m ?? {}),
						reported: shadowToObjects(deviceShadow.state.reported?.lwm2m ?? {}),
					},
				})
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
		track('error', MetricUnit.Count, 1)
	} finally {
		await lock.releaseLock(lockName)
	}
}

export const handler = middy(h).use(logMetrics(metrics))
