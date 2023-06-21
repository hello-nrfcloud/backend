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
const ts = Date.now()
const gain = 3.12345
const expectedMessage = {
	'@context':
		'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain',
	ts,
	mA: gain,
}

const accountDeviceSettings = await getSettings({
	ssm,
	stackName,
})()

const publishDeviceMessage =
	(bridgeInfo: Settings) =>
	async (deviceId: string, message: Record<string, unknown>) => {
		await new Promise((resolve, reject) => {
			const mqttClient = mqtt.connect({
				host: bridgeInfo.mqttEndpoint,
				port: 8883,
				protocol: 'mqtts',
				protocolVersion: 4,
				clean: true,
				clientId: deviceId,
				key: bridgeInfo.accountDevicePrivateKey,
				cert: bridgeInfo.accountDeviceClientCert,
				ca: amazonRootCA1,
			})

			mqttClient.on('connect', () => {
				const topic = `${bridgeInfo.mqttTopicPrefix}m/d/${deviceId}/d2c`
				log.debug('mqtt publish', { mqttMessage: message, topic })
				mqttClient.publish(topic, JSON.stringify(message), (error) => {
					if (error) return reject(error)
					mqttClient.end()
					return resolve(void 0)
				})
			})

			mqttClient.on('error', (error) => {
				log.error(`mqtt error`, { error })
				reject(error)
			})
		})
	}

type ReturnDefer<T> = {
	promise: Promise<T>
	resolve: (value: T) => void
	reject: (reason: any) => void
}

const defer = (timeout: number): ReturnDefer<any> => {
	const ret = {} as ReturnDefer<any>
	const timer = setTimeout(() => {
		ret.reject('timeout')
	}, timeout)

	const promise = new Promise<any>((_resolve, _reject) => {
		ret.resolve = (v) => {
			clearTimeout(timer)
			_resolve(v)
		}
		ret.reject = (reason) => {
			clearTimeout(timer)
			_reject(reason)
		}
	})

	ret.promise = promise

	return ret
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
	const promise = defer(timeoutMS)
	const client = new WebSocket(endpoint)
	client
		.on('open', onConnect)
		.on('error', (error) => promise.reject(error))
		.on('message', async (data: RawData) => {
			const result = await validate(data.toString())
			if (result !== ValidateResponse.skip) {
				if (result === ValidateResponse.valid) {
					promise.resolve(true)
				} else {
					promise.reject(false)
				}
			}
		})

	return promise.promise
}

const h = async (): Promise<void> => {
	await registerDevice({
		db,
		devicesTableName: DevicesTableName,
	})({ id: deviceId, model, fingerprint })

	metrics.addMetric('checkMessageFromWebsocket', MetricUnits.Count, 1)
	try {
		await checkMessageFromWebsocket({
			endpoint: `${websocketUrl}?fingerprint=${fingerprint}`,
			timeoutMS: 10000,
			onConnect: async () => {
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

					if (messageObj['@context'] !== expectedMessage['@context'])
						return ValidateResponse.skip

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
