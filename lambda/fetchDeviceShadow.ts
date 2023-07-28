import { logMetrics, MetricUnits } from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
	EventBridgeClient,
	PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import { SSMClient } from '@aws-sdk/client-ssm'
import { proto } from '@hello.nrfcloud.com/proto/hello/model/PCA20035+solar'
import { getShadowUpdateTime } from '@hello.nrfcloud.com/proto/nrfCloud'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { chunk, once, uniqBy } from 'lodash-es'
import pLimit from 'p-limit'
import { getSettings, Scope } from '../util/settings.js'
import {
	connectionsRepository,
	type WebsocketDeviceConnectionShadowInfo,
} from '../websocket/connectionsRepository.js'
import { createDeviceUpdateChecker } from '../websocket/deviceShadowUpdateChecker.js'
import { createLock } from '../websocket/lock.js'
import { metricsForComponent } from './metrics/metrics.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { configureDeviceShadowFetcher } from './shadow/configureDeviceShadowFetcher.js'
import { logger } from './util/logger.js'

const { track, metrics } = metricsForComponent('shadowFetcher')

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
const lockTTLSeconds = 5
const lock = createLock(db, lockTableName)

const eventBus = new EventBridgeClient({})

const connectionsRepo = connectionsRepository(
	db,
	websocketDeviceConnectionsTableName,
)

const ssm = new SSMClient({})
const { healthCheckClientId } = await getSettings({
	ssm,
	stackName,
	scope: Scope.NRFCLOUD_CONFIG,
})()

// Make sure to call it in the handler, so the AWS Parameters and Secrets Lambda Extension is ready.
const getShadowFetcher = once(configureDeviceShadowFetcher({ stackName }))

const h = async (): Promise<void> => {
	try {
		const lockAcquired = await lock.acquiredLock(lockName, lockTTLSeconds)
		if (lockAcquired === false) {
			log.info(`Other process is still running, then ignore`)
			return
		}

		const deviceShadow = await getShadowFetcher()
		const executionTime = new Date()

		const connections = await connectionsRepo.getAll()
		log.info(`Found ${connections.length} active connections`)
		track('connections', MetricUnits.Count, connections.length)

		if (connections.length === 0) return

		// Filter based on the configuration
		const deviceShadowUpdateChecker = await createDeviceUpdateChecker(
			executionTime,
		)
		const devicesToCheckShadowUpdate = connections.filter((connection) => {
			// The health check device does not publish a valid shadow, so do not fetch it
			if (connection.deviceId === healthCheckClientId) {
				console.debug(
					`Ignoring shadow request for health check device`,
					healthCheckClientId,
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
				chunk(
					uniqBy(devicesToCheckShadowUpdate, (device) => device.deviceId),
					50,
				).map(async (devices) =>
					limit(async () => {
						const start = Date.now()
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
						getShadowUpdateTime(deviceShadow.state.metadata),
				)

				const model = d.model ?? 'default'
				const converted = await proto({
					onError: (message, model, error) => {
						log.error(
							`Failed to convert message ${JSON.stringify(
								message,
							)} from model ${model}: ${error}`,
						)
						track('shadowConversionFailed', MetricUnits.Count, 1)
					},
				})(model, deviceShadow.state)

				if (converted.length === 0) {
					log.debug('shadow was not converted to any message for device', {
						model,
						device: d,
					})
					continue
				}

				log.info(
					`Sending device shadow of ${d.deviceId}(v.${
						d?.version ?? 0
					}) with shadow data version ${deviceShadow.state.version}`,
				)
				await Promise.all(
					converted.map(async (message) => {
						log.debug('Publish websocket message', {
							deviceId: d.deviceId,
							connectionId: d.connectionId,
							message,
						})
						return eventBus.send(
							new PutEventsCommand({
								Entries: [
									{
										EventBusName: eventBusName,
										Source: 'thingy.ws',
										DetailType: 'message',
										Detail: JSON.stringify(<WebsocketPayload>{
											deviceId: d.deviceId,
											connectionId: d.connectionId,
											message,
										}),
									},
								],
							}),
						)
					}),
				)
			}
		}
	} catch (error) {
		log.error(`fetch device shadow error`, { error })
	} finally {
		await lock.releaseLock(lockName)
	}
}

export const handler = middy(h).use(logMetrics(metrics))
