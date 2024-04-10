import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import assert from 'node:assert/strict'
import { registerDevice } from '../devices/registerDevice.js'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import {
	getAllAccountsSettings,
	type Settings as NrfCloudSettings,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import {
	ValidateResponse,
	checkMessageFromWebsocket,
} from './health-check/checkMessageFromWebsocket.js'
import { createPublicKey, createPrivateKey } from 'node:crypto'
import { parseDateTimeFromLog } from './health-check/parseDateTimeFromLog.js'
import { getAllAccountsSettings as getAllAccountsHealthCheckSettings } from '../settings/health-check/device.js'

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
})

const allAccountsHealthCheckSettings = await getAllAccountsHealthCheckSettings({
	ssm,
	stackName,
})

await Promise.all(
	Object.entries(allAccountsHealthCheckSettings).map(
		async ([account, settings]) => {
			await registerDevice({
				db,
				devicesTableName: DevicesTableName,
			})({
				id: settings.healthCheckClientId,
				model: settings.healthCheckModel,
				fingerprint: settings.healthCheckFingerPrint,
				account,
			})
		},
	),
)

const publishDeviceMessageOnCoAP =
	({
		nrfCloudSettings,
		deviceProperties,
	}: {
		nrfCloudSettings: NrfCloudSettings
		deviceProperties: {
			deviceId: string
			publicKey: string
			privateKey: string
		}
	}) =>
	async (message: Record<string, unknown>): Promise<Date | null> => {
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
		} else {
			log.debug(`CoAP simulator log`, { log: result.body })
			const coapStart = (result.body as string[])?.[0]
			if (coapStart === undefined) return null

			return parseDateTimeFromLog(coapStart)
		}
	}

type KeyPair = {
	publicKey: string
	privateKey: string
}
const cacheAccountCertificates = new Map<string, KeyPair>()

const h = async (): Promise<void> => {
	const store = new Map<
		string,
		{ ts: number; temperature: number; coapTs: number | null }
	>()
	track('checkMessageFromWebsocket', MetricUnit.Count, 1)
	await Promise.all(
		Object.entries(allAccountsHealthCheckSettings).map(
			async ([account, healthCheckSettings]) => {
				try {
					const {
						healthCheckFingerPrint: fingerprint,
						healthCheckClientId: deviceId,
						healthCheckClientCert,
						healthCheckPrivateKey,
					} = healthCheckSettings

					let certificates: KeyPair
					if (cacheAccountCertificates.has(account) === false) {
						const publicKey = createPublicKey(healthCheckClientCert)
							.export({
								format: 'pem',
								type: 'spki',
							})
							.toString()
						const privateKey = createPrivateKey(healthCheckPrivateKey)
							.export({
								format: 'pem',
								type: 'pkcs8',
							})
							.toString()
						certificates = { publicKey, privateKey }
						cacheAccountCertificates.set(account, certificates)
					} else {
						certificates = cacheAccountCertificates.get(account) as KeyPair
					}

					await checkMessageFromWebsocket({
						endpoint: `${websocketUrl}?fingerprint=${fingerprint}`,
						timeoutMS: 25000,
						onConnect: async () => {
							const data = {
								ts: Date.now(),
								temperature: Number((Math.random() * 20).toFixed(1)),
							}
							const coapTs = await publishDeviceMessageOnCoAP({
								nrfCloudSettings: allAccountsSettings[
									account
								] as NrfCloudSettings,
								deviceProperties: {
									deviceId,
									...certificates,
								},
							})({
								appId: 'TEMP',
								messageType: 'DATA',
								ts: data.ts,
								data: `${data.temperature}`,
							})
							store.set(account, { ...data, coapTs: coapTs?.getTime() ?? null })
						},
						validate: async (message) => {
							try {
								const data = store.get(account)
								if (data === undefined) return ValidateResponse.skip

								const messageObj = JSON.parse(message)
								log.debug(`ws incoming message`, { messageObj })
								const expectedMessage = {
									'@context':
										'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/airTemperature',
									ts: data.ts,
									c: data.temperature,
								}

								if (messageObj['@context'] !== expectedMessage['@context'])
									return ValidateResponse.skip

								track(
									`receivingMessageDuration`,
									MetricUnit.Seconds,
									(Date.now() - (data.coapTs ?? data.ts)) / 1000,
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

export const handler = middy(h).use(logMetrics(metrics))
