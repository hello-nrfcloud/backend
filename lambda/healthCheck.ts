import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import {
	getAllAccountsSettings,
	type Settings as NrfCloudSettings,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import {
	LwM2MObjectID,
	type BatteryAndPower_14202,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import { lwm2mToSenML } from '@hello.nrfcloud.com/proto-map/senml'
import middy from '@middy/core'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/middleware/requestLogger'
import { fromEnv } from '@bifravst/from-env'
import mqtt from 'mqtt'
import assert from 'node:assert'
import { registerDevice } from '../devices/registerDevice.js'
import { getAllAccountsSettings as getAllAccountsHealthCheckSettings } from '../settings/health-check/device.js'
import {
	ValidateResponse,
	checkMessageFromWebsocket,
} from './health-check/checkMessageFromWebsocket.js'
import { defer } from './health-check/defer.js'

const { DevicesTableName, stackName, websocketUrl } = fromEnv({
	DevicesTableName: 'DEVICES_TABLE_NAME',
	stackName: 'STACK_NAME',
	websocketUrl: 'WEBSOCKET_URL',
})(process.env)

const log = logger('healthCheck')
const db = new DynamoDBClient({})
const ssm = new SSMClient({})

const { track, metrics } = metricsForComponent('healthCheck')

const amazonRootCA1 =
	'-----BEGIN CERTIFICATE-----\n' +
	'MIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF\n' +
	'ADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6\n' +
	'b24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL\n' +
	'MAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv\n' +
	'b3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj\n' +
	'ca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM\n' +
	'9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw\n' +
	'IFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6\n' +
	'VOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L\n' +
	'93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm\n' +
	'jgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC\n' +
	'AYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA\n' +
	'A4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI\n' +
	'U5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs\n' +
	'N+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vv\n' +
	'o/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU\n' +
	'5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpy\n' +
	'rqXRfboQnoZsG4q5WTP468SQvvG5\n' +
	'-----END CERTIFICATE-----\n'

const allAccountsSettings = await getAllAccountsSettings({
	ssm,
	stackName,
})

const allAccountsHealthCheckSettings = await getAllAccountsHealthCheckSettings({
	ssm,
	stackName,
})

await Promise.all(
	Object.entries(allAccountsHealthCheckSettings).map(
		async ([account, settings]) => {
			if ('healthCheckSettings' in settings) {
				await registerDevice({
					db,
					devicesTableName: DevicesTableName,
				})({
					id: settings.healthCheckClientId,
					model: settings.healthCheckModel,
					fingerprint: settings.healthCheckFingerPrint,
					account,
				})
			} else {
				log.warn(`${account} does not have health check settings`)
			}
		},
	),
)

const publishDeviceMessage =
	({
		nrfCloudSettings,
		deviceId,
		deviceCert,
		devicePrivateKey,
	}: {
		nrfCloudSettings: NrfCloudSettings
		deviceId: string
		deviceCert: string
		devicePrivateKey: string
	}) =>
	async (message: unknown): Promise<void> => {
		const { promise, resolve, reject } = defer<void>(10000)

		const mqttClient = mqtt.connect({
			host: nrfCloudSettings.mqttEndpoint,
			port: 8883,
			protocol: 'mqtts',
			protocolVersion: 4,
			clean: true,
			clientId: deviceId,
			key: devicePrivateKey,
			cert: deviceCert,
			ca: amazonRootCA1,
			connectTimeout: 5000,
		})

		mqttClient
			.on('connect', () => {
				const topic = `${nrfCloudSettings.mqttTopicPrefix}m/d/${deviceId}/d2c/senml`
				log.debug('mqtt publish', { mqttMessage: message, topic })
				mqttClient.publish(topic, JSON.stringify(message), (error) => {
					if (error !== undefined) return reject(error)
					mqttClient.end()
					return resolve()
				})
			})
			.on('error', (error) => {
				log.error(`mqtt error`, { error })
				reject(error)
			})
			.on('reconnect', () => {
				log.debug(`mqtt reconnect`)
			})

		await promise
	}

const h = async (): Promise<void> => {
	const store = new Map<string, { ts: number; gain: number }>()
	track('checkMessageFromWebsocket', MetricUnit.Count, 1)
	await Promise.all(
		Object.entries(allAccountsHealthCheckSettings).map(
			async ([account, healthCheckSettings]) => {
				try {
					const {
						healthCheckFingerPrint: fingerprint,
						healthCheckClientId: deviceId,
						healthCheckClientCert: deviceCert,
						healthCheckPrivateKey: devicePrivateKey,
					} = healthCheckSettings

					await checkMessageFromWebsocket({
						endpoint: `${websocketUrl}?fingerprint=${fingerprint}`,
						timeoutMS: 10000,
						log: (...args) => {
							const [first, ...rest] = args
							log.debug(first, ...rest)
						},
						onConnect: async () => {
							const data = {
								ts: Date.now(),
								gain: 3 + Number(Math.random().toFixed(5)),
							}
							store.set(account, data)
							const maybeSenML = lwm2mToSenML(<BatteryAndPower_14202>{
								ObjectID: LwM2MObjectID.BatteryAndPower_14202,
								ObjectVersion: '1.0',
								Resources: {
									1: data.gain,
									99: Math.floor(data.ts / 1000),
								},
							})
							if ('errors' in maybeSenML)
								throw new Error(`Failed to create SenML!`)
							await publishDeviceMessage({
								nrfCloudSettings: allAccountsSettings[
									account
								] as NrfCloudSettings,
								deviceId,
								deviceCert,
								devicePrivateKey,
							})(maybeSenML.senML)
						},
						validate: async (message) => {
							try {
								const data = store.get(account)
								if (data === undefined) return ValidateResponse.skip

								const messageObj = JSON.parse(message)
								log.debug(`ws incoming message`, { messageObj })

								try {
									const {
										ObjectID,
										Resources,
										'@context': context,
									} = messageObj
									assert.deepEqual(
										{
											'@context': context,
											ObjectID,
											Resources,
										},
										{
											'@context':
												'https://github.com/hello-nrfcloud/proto/lwm2m/object/update',
											ObjectID: LwM2MObjectID.BatteryAndPower_14202,
											Resources: {
												1: data.gain,
												99: Math.floor(data.ts / 1000),
											},
										},
									)
								} catch (err) {
									console.debug(`Message not matched`, JSON.stringify(err))
									return ValidateResponse.skip
								}

								track(
									`receivingMessageDuration`,
									MetricUnit.Milliseconds,
									Date.now() - data.ts,
								)

								return ValidateResponse.valid
							} catch (error) {
								log.error(`validate error`, { error, account })

								return ValidateResponse.invalid
							}
						},
					})
					track(`success`, MetricUnit.Count, 1)
				} catch (error) {
					log.error(`health check error`, {
						error: (error as Error).message,
						account,
					})
					track('fail', MetricUnit.Count, 1)
				}
			},
		),
	)
}

export const handler = middy()
	.use(requestLogger())
	.use(logMetrics(metrics))
	.handler(h)
