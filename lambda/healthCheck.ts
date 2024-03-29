import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import mqtt from 'mqtt'
import assert from 'node:assert/strict'
import { registerDevice } from '../devices/registerDevice.js'
import { defer } from '../util/defer.js'
import { metricsForComponent } from './metrics/metrics.js'
import { logger } from './util/logger.js'
import { getAllAccountsSettings } from '../nrfcloud/allAccounts.js'
import type { Settings } from '../nrfcloud/settings.js'
import {
	ValidateResponse,
	checkMessageFromWebsocket,
} from '../util/checkMessageFromWebsocket.js'

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
})()

await Promise.all(
	Object.entries(allAccountsSettings).map(async ([account, settings]) => {
		if ('healthCheckSettings' in settings) {
			await registerDevice({
				db,
				devicesTableName: DevicesTableName,
			})({
				id: settings.healthCheckSettings.healthCheckClientId,
				model: settings.healthCheckSettings.healthCheckModel,
				fingerprint: settings.healthCheckSettings.healthCheckFingerPrint,
				account,
			})
		} else {
			log.warn(`${account} does not have health check settings`)
		}
	}),
)

const publishDeviceMessage =
	({
		nrfCloudSettings,
		deviceId,
		deviceCert,
		devicePrivateKey,
	}: {
		nrfCloudSettings: Settings
		deviceId: string
		deviceCert: string
		devicePrivateKey: string
	}) =>
	async (message: Record<string, unknown>): Promise<void> => {
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
				const topic = `${nrfCloudSettings.mqttTopicPrefix}m/d/${deviceId}/d2c`
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
		Object.entries(allAccountsSettings).map(async ([account, settings]) => {
			try {
				if (
					!('healthCheckSettings' in settings) ||
					!('nrfCloudSettings' in settings)
				)
					return

				const {
					nrfCloudSettings,
					healthCheckSettings: {
						healthCheckFingerPrint: fingerprint,
						healthCheckClientId: deviceId,
						healthCheckClientCert: deviceCert,
						healthCheckPrivateKey: devicePrivateKey,
					},
				} = settings

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
						await publishDeviceMessage({
							nrfCloudSettings,
							deviceId,
							deviceCert,
							devicePrivateKey,
						})({
							appId: 'SOLAR',
							messageType: 'DATA',
							ts: data.ts,
							data: `${data.gain}`,
						})
					},
					validate: async (message) => {
						try {
							const data = store.get(account)
							const messageObj = JSON.parse(message)
							log.debug(`ws incoming message`, { messageObj })
							const expectedMessage = {
								'@context':
									'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain',
								ts: data?.ts,
								mA: data?.gain,
							}

							if (messageObj['@context'] !== expectedMessage['@context'])
								return ValidateResponse.skip

							track(
								`receivingMessageDuration`,
								MetricUnit.Seconds,
								(Date.now() - (data?.ts ?? 0)) / 1000,
							)
							assert.deepEqual(messageObj, expectedMessage)
							return ValidateResponse.valid
						} catch (error) {
							log.error(`validate error`, { error, account })

							return ValidateResponse.invalid
						}
					},
				})
				track(`success`, MetricUnit.Count, 1)
			} catch (error) {
				log.error(`health check error`, { error, account })
				track('fail', MetricUnit.Count, 1)
			}
		}),
	)
}

export const handler = middy(h).use(logMetrics(metrics))
