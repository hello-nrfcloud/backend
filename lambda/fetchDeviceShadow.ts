import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
	GetThingShadowCommand,
	IoTDataPlaneClient,
	UpdateThingShadowCommand,
} from '@aws-sdk/client-iot-data-plane'
import { SSMClient } from '@aws-sdk/client-ssm'
import { fromEnv } from '@bifravst/from-env'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import { getDeviceShadow } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import {
	defaultApiEndpoint,
	getAllAccountsSettings as getAllNRFCloudAccountSettings,
	type Settings,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import { validate, validators } from '@hello.nrfcloud.com/proto-map/lwm2m'
import {
	objectsToShadow,
	type LwM2MShadow,
} from '@hello.nrfcloud.com/proto-map/lwm2m/aws'
import middy from '@middy/core'
import { chunk, groupBy, uniqBy } from 'lodash-es'
import pLimit from 'p-limit'
import { shadowDiff } from '../historicalData/shadowDiff.js'
import { nrfCloudShadowToObjects } from '../nrfCloud/nrfCloudShadowToObjects.js'
import { getAllAccountsSettings } from '../settings/health-check/device.js'
import { loggingFetch } from '../util/loggingFetch.js'
import {
	connectionsRepository,
	type WebsocketDeviceConnectionShadowInfo,
} from '../websocket/connectionsRepository.js'
import { createDeviceUpdateChecker } from '../websocket/deviceShadowUpdateChecker.js'
import { createLock } from '../websocket/lock.js'

const { track, metrics } = metricsForComponent('shadowFetcher')

const { websocketDeviceConnectionsTableName, lockTableName, stackName } =
	fromEnv({
		stackName: 'STACK_NAME',
		websocketDeviceConnectionsTableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
		lockTableName: 'LOCK_TABLE_NAME',
	})(process.env)

const limit = pLimit(3)
const db = new DynamoDBClient({})
const log = logger('fetchDeviceShadow')

const lockName = 'fetch-shadow'
const lockTTLSeconds = 5
const lock = createLock(db, lockTableName)

const connectionsRepo = connectionsRepository(
	db,
	websocketDeviceConnectionsTableName,
)

const ssm = new SSMClient({})
const iot = new IoTDataPlaneClient({})

const allNRFCloudSettings = await getAllNRFCloudAccountSettings({
	ssm,
	stackName,
})

const healthCheckClientIds = await (async () => {
	const settings = await getAllAccountsSettings({ ssm, stackName })
	return Object.values(settings).map((settings) => settings.healthCheckClientId)
})()

const validateLwM2MObjectInstance = validate(validators)

const h = async (): Promise<void> => {
	try {
		const lockAcquired = await lock.acquiredLock(lockName, lockTTLSeconds)
		if (lockAcquired === false) {
			track('locked', MetricUnit.Count, 1)
			log.info(`Other process is still running, then ignore`)
			return
		}

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
										if (res.error instanceof Error) {
											log.error(`Fetching shadow error`, {
												error: res.error.message,
											})
										} else {
											log.error(`Fetching shadow error`, { error: res.error })
										}

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
			if (deviceShadow.state === undefined) {
				track('noShadow', MetricUnit.Count, 1)
				continue
			}
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
					`Storing device shadow of ${d.deviceId} (v.${
						d?.version ?? 0
					}) with shadow data version ${deviceShadow.state.version}`,
				)

				log.debug('deviceShadow', deviceShadow)

				// Convert parts written by the nRF Cloud library in the firmware to LwM2M objects
				const lwm2mObjects = nrfCloudShadowToObjects(deviceShadow.state)
				log.debug('deviceShadow', deviceShadow)
				log.debug('nrfCloudShadow', lwm2mObjects)
				const nrfCloudShadow = lwm2mObjects.filter((o) => {
					const maybeValid = validateLwM2MObjectInstance(o)
					if ('error' in maybeValid) {
						log.error('Invalid LwM2M object', o)
						log.error('shadow2lwm2m:error', maybeValid.error.message)
						track('shadow2lwm2m:error', MetricUnit.Count, 1)
						return false
					}

					return true
				})

				track('shadow2lwm2m:success', MetricUnit.Count, nrfCloudShadow.length)
				track(
					'shadow2lwm2m:error',
					MetricUnit.Count,
					lwm2mObjects.length - nrfCloudShadow.length,
				)

				// The device configuration is written directly as LwM2M objects to the `lwm2m` subsection of the nRF Cloud device shadow document
				const desiredConfig = deviceShadow.state.desired?.lwm2m ?? {}
				const reportedConfig = deviceShadow.state.reported?.lwm2m ?? {}

				const update: {
					reported?: LwM2MShadow
					desired?: LwM2MShadow
				} = {
					desired: desiredConfig,
					reported: { ...reportedConfig, ...objectsToShadow(nrfCloudShadow) },
				}

				log.debug('update', update)

				let diff = update

				// Compare with the current device state
				let state:
					| {
							reported?: LwM2MShadow
							desired?: LwM2MShadow
					  }
					| undefined = undefined
				try {
					const { payload } = await iot.send(
						new GetThingShadowCommand({
							thingName: d.deviceId,
							shadowName: 'lwm2m',
						}),
					)
					const lwm2mShadow =
						payload !== undefined
							? JSON.parse(new TextDecoder('utf-8').decode(payload))
							: { state: { desired: {}, reported: {} } }

					state = lwm2mShadow.state
				} catch {
					log.debug(`No existing shadow for ${d.deviceId}.`)
				}

				if (state !== undefined) {
					log.debug('state', state)
					diff = shadowDiff(state, update)
					log.debug('diff', diff)
				}

				if (Object.keys(diff).length === 0) {
					console.debug(`No diff for ${d.deviceId}.`)
				} else {
					await iot.send(
						new UpdateThingShadowCommand({
							thingName: d.deviceId,
							shadowName: 'lwm2m',
							payload: JSON.stringify({
								state: diff,
							}),
						}),
					)
				}
			}
		}
	} catch (error) {
		log.error(`fetch device shadow error`, { error: (error as Error).message })
		track('error', MetricUnit.Count, 1)
	} finally {
		await lock.releaseLock(lockName)
	}
}

export const handler = middy()
	.use(requestLogger())
	.use(logMetrics(metrics))
	.handler(h)
