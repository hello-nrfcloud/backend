import { MetricUnits, logMetrics } from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import assert from 'node:assert/strict'
import { registerDevice } from '../devices/registerDevice.js'
import { metricsForComponent } from './metrics/metrics.js'
import { logger } from './util/logger.js'
import { getAllAccountsSettings } from '../nrfcloud/allAccounts.js'
import type { Settings } from '../nrfcloud/settings.js'
import {
	ValidateResponse,
	checkMessageFromWebsocket,
} from '../util/checkMessageFromWebsocket.js'

const { DevicesTableName, stackName, websocketUrl, coapLambda } = fromEnv({
	DevicesTableName: 'DEVICES_TABLE_NAME',
	stackName: 'STACK_NAME',
	websocketUrl: 'WEBSOCKET_URL',
	coapLambda: 'COAP_LAMBDA',
})(process.env)

const log = logger('healthCheckForCoAP')
const db = new DynamoDBClient({})
const ssm = new SSMClient({})
const lambda = new LambdaClient({})

const { track, metrics } = metricsForComponent('healthCheckForCoAP')

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

const publishDeviceMessageOnCoAP =
	({
		nrfCloudSettings,
		deviceProperties,
	}: {
		nrfCloudSettings: Settings
		deviceProperties: {
			deviceId: string
			publicKey: string
			privateKey: string
		}
	}) =>
	async (message: Record<string, unknown>): Promise<void> => {
		const timeout = setTimeout(() => {
			throw new Error('CoAP simulator timeout')
		}, 25000)

		const { Payload } = await lambda.send(
			new InvokeCommand({
				FunctionName: coapLambda,
				Payload: Buffer.from(
					JSON.stringify({
						deviceProperties: {
							...deviceProperties,
							host: nrfCloudSettings.coapEndpoint.host,
							port: nrfCloudSettings.coapPort,
						},
						args: ['send', 'POST', '/msg/d2c', '-p', JSON.stringify(message)],
					}),
				),
				LogType: 'Tail',
			}),
		)
		clearTimeout(timeout)

		const result = JSON.parse(new TextDecoder().decode(Payload))
		if (result.statusCode !== 200) {
			log.error(`CoAP simulator error`, { error: result.body })

			throw new Error(`CoAP simulator error`)
		}
	}

const h = async (): Promise<void> => {
	const store = new Map<string, { ts: number; temperature: number }>()
	track('checkMessageFromWebsocket', MetricUnits.Count, 1)
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
						healthCheckPublicKey: publicKey,
						healthCheckPkcs8PrivateKey: privateKey,
					},
				} = settings

				if (publicKey === undefined || privateKey === undefined) return

				await checkMessageFromWebsocket({
					endpoint: `${websocketUrl}?fingerprint=${fingerprint}`,
					timeoutMS: 25000,
					onConnect: async () => {
						const data = {
							ts: Date.now(),
							temperature: Number((Math.random() * 20).toFixed(1)),
						}
						store.set(account, data)
						await publishDeviceMessageOnCoAP({
							nrfCloudSettings,
							deviceProperties: {
								deviceId,
								publicKey,
								privateKey,
							},
						})({
							appId: 'TEMP',
							messageType: 'DATA',
							ts: data.ts,
							data: `${data.temperature}`,
						})
					},
					validate: async (message) => {
						try {
							const data = store.get(account)
							const messageObj = JSON.parse(message)
							log.debug(`ws incoming message`, { messageObj })
							const expectedMessage = {
								'@context':
									'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/airTemperature',
								ts: data?.ts,
								c: data?.temperature,
							}

							if (messageObj['@context'] !== expectedMessage['@context'])
								return ValidateResponse.skip

							track(
								`receivingMessageDuration`,
								MetricUnits.Seconds,
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
				track(`success`, MetricUnits.Count, 1)
			} catch (error) {
				log.error(`health check error`, { error, account })
				track('fail', MetricUnits.Count, 1)
			}
		}),
	)
}

export const handler = middy(h).use(logMetrics(metrics))
