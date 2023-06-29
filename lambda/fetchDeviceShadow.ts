import {
	logMetrics,
	Metrics,
	MetricUnits,
} from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
	EventBridgeClient,
	PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import { proto } from '@hello.nrfcloud.com/proto/hello'
import { getShadowUpdateTime } from '@hello.nrfcloud.com/proto/nrfCloud'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { chunk, once } from 'lodash-es'
import pLimit from 'p-limit'
import {
	connectionsRepository,
	type WebsocketDeviceConnectionShadowInfo,
} from '../websocket/connectionsRepository.js'
import { createLock } from '../websocket/lock.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { configureDeviceShadowFetcher } from './shadow/configureDeviceShadowFetcher.js'
import { logger } from './util/logger.js'

const metrics = new Metrics({
	namespace: 'hello-nrfcloud-backend',
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
const lockTTLSeconds = 5
const lock = createLock(db, lockTableName)

const eventBus = new EventBridgeClient({})

const connectionsRepo = connectionsRepository(
	db,
	websocketDeviceConnectionsTableName,
)

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
		const connections = await connectionsRepo.getAll()
		log.info(`Found ${connections.length} active connections`)
		metrics.addMetric('connections', MetricUnits.Count, connections.length)
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
				chunk(connections, 50).map(async (devices) =>
					limit(async () => {
						const start = Date.now()
						const res = await deviceShadow(
							devices.map((device) => device.deviceId),
						)
						metrics.addMetric(
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

				metrics.addMetric(
					'shadowVersionDelta',
					MetricUnits.Count,
					deviceShadow.state.version - (d.version ?? 0),
				)

				const isUpdated = await connectionsRepo.updateDeviceVersion(
					d.connectionId,
					deviceShadow.state.version,
				)

				if (!isUpdated) {
					metrics.addMetric('shadowStale', MetricUnits.Count, 1)
					continue
				}

				metrics.addMetric('shadowUpdated', MetricUnits.Count, 1)
				metrics.addMetric(
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
						metrics.addMetric('shadowConversionFailed', MetricUnits.Count, 1)
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
		console.error(error)
	} finally {
		await lock.releaseLock(lockName)
	}
}

export const handler = middy(h).use(logMetrics(metrics))
