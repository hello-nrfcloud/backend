import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { SSMClient } from '@aws-sdk/client-ssm'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import {
	getAllAccountsSettings,
	type Settings as NrfCloudSettings,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import {
	LwM2MObjectID,
	type Environment_14205,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import {
	lwm2mToSenML,
	type SenMLType,
} from '@hello.nrfcloud.com/proto-map/senml'
import middy from '@middy/core'
import { requestLogger } from './middleware/requestLogger.js'
import { fromEnv } from '@nordicsemiconductor/from-env'
import assert from 'node:assert/strict'
import { registerDevice } from '../devices/registerDevice.js'
import { encode } from '../feature-runner/steps/device/senmlCbor.js'
import { getAllAccountsSettings as getAllAccountsHealthCheckSettings } from '../settings/health-check/device.js'
import {
	ValidateResponse,
	checkMessageFromWebsocket,
} from './health-check/checkMessageFromWebsocket.js'
import { parseDateTimeFromLog } from './health-check/parseDateTimeFromLog.js'

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
			privateKey: string
		}
	}) =>
	async (message: SenMLType): Promise<Date | null> => {
		const timeout = setTimeout(() => {
			throw new Error('CoAP simulator timeout')
		}, 25000)

		const cbor = encode(message)

		const InvokePayload = {
			...deviceProperties,
			host: nrfCloudSettings.coapEndpoint.host,
			port: nrfCloudSettings.coapPort,
			payload: cbor.toString('hex'),
		}

		log.debug(`InvokePayload`, { InvokePayload })

		const { Payload } = await lambda.send(
			new InvokeCommand({
				FunctionName: coapLambda,
				Payload: Buffer.from(JSON.stringify(InvokePayload)),
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

const cacheAccountCertificates = new Map<string, string>()

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
						healthCheckPrivateKey,
					} = healthCheckSettings

					let privateKey: string
					if (cacheAccountCertificates.has(account) === false) {
						privateKey = healthCheckPrivateKey
						cacheAccountCertificates.set(account, privateKey)
					} else {
						privateKey = cacheAccountCertificates.get(account) as string
					}

					await checkMessageFromWebsocket({
						endpoint: `${websocketUrl}?fingerprint=${fingerprint}`,
						timeoutMS: 25000,
						onConnect: async () => {
							const data = {
								ts: Date.now(),
								temperature: Number((Math.random() * 20).toFixed(1)),
							}
							const maybeSenML = lwm2mToSenML(<Environment_14205>{
								ObjectID: LwM2MObjectID.Environment_14205,
								ObjectVersion: '1.0',
								Resources: {
									0: data.temperature,
									99: Math.floor(data.ts / 1000),
								},
							})
							if ('errors' in maybeSenML)
								throw new Error(`Failed to create SenML!`)

							const coapTs = await publishDeviceMessageOnCoAP({
								nrfCloudSettings: allAccountsSettings[
									account
								] as NrfCloudSettings,
								deviceProperties: {
									deviceId,
									privateKey,
								},
							})(maybeSenML.senML)
							store.set(account, { ...data, coapTs: coapTs?.getTime() ?? null })
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
											ObjectID: LwM2MObjectID.Environment_14205,
											Resources: {
												0: data.temperature,
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
									MetricUnit.Seconds,
									Date.now() - (data.coapTs ?? data.ts),
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
