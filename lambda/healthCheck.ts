import {
	MetricUnits,
	Metrics,
	logMetrics,
} from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import mqtt from 'mqtt'
import assert from 'node:assert/strict'
import { WebSocket, type RawData } from 'ws'
import { registerDevice } from '../devices/registerDevice.js'
import { getSettings, type Settings } from '../nrfcloud/settings.js'
import { defer } from '../util/defer.js'
import { logger } from './util/logger.js'

const { DevicesTableName, stackName, amazonRootCA1, websocketUrl } = fromEnv({
	DevicesTableName: 'DEVICES_TABLE_NAME',
	stackName: 'STACK_NAME',
	amazonRootCA1: 'AMAZON_ROOT_CA1',
	websocketUrl: 'WEBSOCKET_URL',
})(process.env)

const log = logger('healthCheck')
const db = new DynamoDBClient({})
const ssm = new SSMClient({})

const metrics = new Metrics({
	namespace: 'hello-nrfcloud-backend',
	serviceName: 'healthCheck',
})

const deviceId = 'health-check'
const model = 'PCA20035+solar'
const fingerprint = '29a.ch3ckr'
const gain = 3.12345

const accountDeviceSettings = await getSettings({
	ssm,
	stackName,
})()

const publishDeviceMessage =
	(nrfCloudInfo: Settings) =>
	async (deviceId: string, message: Record<string, unknown>): Promise<void> => {
		const { promise, resolve, reject } = defer<void>(10000)

		const mqttClient = mqtt.connect({
			host: nrfCloudInfo.mqttEndpoint,
			port: 8883,
			protocol: 'mqtts',
			protocolVersion: 4,
			clean: true,
			clientId: deviceId,
			key: nrfCloudInfo.accountDevicePrivateKey,
			cert: nrfCloudInfo.accountDeviceClientCert,
			ca: amazonRootCA1,
		})

		mqttClient.on('connect', () => {
			const topic = `${nrfCloudInfo.mqttTopicPrefix}m/d/${deviceId}/d2c`
			log.debug('mqtt publish', { mqttMessage: message, topic })
			mqttClient.publish(topic, JSON.stringify(message), (error) => {
				if (error) return reject(error)
				mqttClient.end()
				return resolve()
			})
		})

		mqttClient.on('error', (error) => {
			log.error(`mqtt error`, { error })
			reject(error)
		})

		await promise
	}

enum ValidateResponse {
	skip,
	valid,
	invalid,
}

const checkMessageFromWebsocket = async ({
	endpoint,
	timeoutMS,
	onConnect,
	validate,
}: {
	endpoint: string
	timeoutMS: number
	onConnect: () => Promise<void>
	validate: (message: string) => Promise<ValidateResponse>
}) => {
	const { promise, resolve, reject } = defer<boolean>(timeoutMS)
	const client = new WebSocket(endpoint)
	client
		.on('open', async () => {
			await onConnect()
		})
		.on('close', () => {
			log.debug(`ws is closed`)
		})
		.on('error', reject)
		.on('message', async (data: RawData) => {
			const result = await validate(data.toString())
			if (result !== ValidateResponse.skip) {
				client.terminate()
				if (result === ValidateResponse.valid) {
					resolve(true)
				} else {
					reject(false)
				}
			}
		})

	return promise
}

await registerDevice({
	db,
	devicesTableName: DevicesTableName,
})({ id: deviceId, model, fingerprint })

const h = async (): Promise<void> => {
	let ts: number
	metrics.addMetric('checkMessageFromWebsocket', MetricUnits.Count, 1)
	try {
		await checkMessageFromWebsocket({
			endpoint: `${websocketUrl}?fingerprint=${fingerprint}`,
			timeoutMS: 10000,
			onConnect: async () => {
				ts = Date.now()
				await publishDeviceMessage(accountDeviceSettings)(deviceId, {
					appId: 'SOLAR',
					messageType: 'DATA',
					ts,
					data: `${gain}`,
				})
			},
			validate: async (message) => {
				try {
					const messageObj = JSON.parse(message)
					log.debug(`ws incoming message`, { messageObj })
					const expectedMessage = {
						'@context':
							'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain',
						ts,
						mA: gain,
					}

					if (messageObj['@context'] !== expectedMessage['@context'])
						return ValidateResponse.skip

					metrics.addMetric(
						`receivingMessageDuration`,
						MetricUnits.Seconds,
						(Date.now() - ts) / 1000,
					)
					assert.deepEqual(messageObj, expectedMessage)
					return ValidateResponse.valid
				} catch (error) {
					log.error(`validate error`, { error })

					return ValidateResponse.invalid
				}
			},
		})
		metrics.addMetric('success', MetricUnits.Count, 1)
	} catch (error) {
		log.error(`health check error`, { error })
		metrics.addMetric('fail', MetricUnits.Count, 1)
	}
}

export const handler = middy(h).use(logMetrics(metrics))
