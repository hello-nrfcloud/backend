import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
	codeBlockOrThrow,
	noMatch,
	type StepRunResult,
	type StepRunner,
	type StepRunnerArgs,
} from '@nordicsemiconductor/bdd-markdown'
import mqtt from 'mqtt'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import pRetry from 'p-retry'
import { generateCode } from '../../cli/devices/generateCode.js'
import { getDevice as getDeviceFromIndex } from '../../devices/getDevice.js'
import { getModelForDevice } from '../../devices/getModelForDevice.js'
import { registerDevice } from '../../devices/registerDevice.js'
import type { Settings } from '../../nrfcloud/settings.js'
import type { World } from '../run-features.js'

const createDeviceForModel =
	({ db }: { db: DynamoDBClient }) =>
	async ({
		step,
		log: {
			step: { progress },
		},
		context,
	}: StepRunnerArgs<
		World & Record<string, string>
	>): Promise<StepRunResult> => {
		const match =
			/^I have the fingerprint for a `(?<model>[^`]+)` device in `(?<storageName>[^`]+)`$/.exec(
				step.title,
			)
		if (match === null) return noMatch
		const { model, storageName } = match.groups as {
			model: string
			storageName: string
		}

		const fingerprint = `92b.${generateCode()}`
		const id = randomUUID()

		const { devicesTable, devicesTableFingerprintIndexName } = context
		progress(`Registering device ${id} into table ${devicesTable}`)
		await registerDevice({ db, devicesTableName: devicesTable })({
			id,
			model,
			fingerprint,
		})

		await pRetry(
			async () => {
				const res = await getDeviceFromIndex({
					db,
					devicesTableName: devicesTable,
					devicesIndexName: devicesTableFingerprintIndexName,
				})({ fingerprint })
				if ('error' in res)
					throw new Error(`Failed to resolve fingerprint ${fingerprint}!`)
			},
			{
				retries: 5,
				minTimeout: 500,
				maxTimeout: 1000,
			},
		)

		await pRetry(
			async () => {
				const res = await getModelForDevice({
					db,
					DevicesTableName: devicesTable,
				})(id)
				if ('error' in res)
					throw new Error(`Failed to get model for device ${id}!`)
			},
			{
				retries: 5,
				minTimeout: 500,
				maxTimeout: 1000,
			},
		)

		context[storageName] = fingerprint
		context[`${storageName}:deviceId`] = id

		progress(`Device registered: ${fingerprint} (${id})`)
	}

const publishDeviceMessage =
	(bridgeInfo: Settings) =>
	async ({
		step,
		log: {
			step: { progress, error },
		},
	}: StepRunnerArgs<World>): Promise<StepRunResult> => {
		const match =
			/^the device `(?<id>[^`]+)` publishes this message to the topic `(?<topic>[^`]+)`$/.exec(
				step.title,
			)
		if (match === null) return noMatch

		const message = JSON.parse(codeBlockOrThrow(step).code)

		progress(
			`Device id ${match.groups?.id} publishes to topic ${match.groups?.topic}`,
		)
		await new Promise((resolve, reject) => {
			const mqttClient = mqtt.connect({
				host: bridgeInfo.mqttEndpoint,
				port: 8883,
				protocol: 'mqtts',
				protocolVersion: 4,
				clean: true,
				clientId: match.groups?.id ?? '',
				key: bridgeInfo.accountDevicePrivateKey,
				cert: bridgeInfo.accountDeviceClientCert,
				ca: readFileSync(
					path.join(process.cwd(), 'data', 'AmazonRootCA1.pem'),
					'utf-8',
				),
			})

			mqttClient.on('connect', () => {
				progress('connected')
				const topic = `${bridgeInfo.mqttTopicPrefix}${
					match.groups?.topic ?? ''
				}`
				progress('publishing', message, topic)
				mqttClient.publish(topic, JSON.stringify(message), (error) => {
					if (error) return reject(error)
					mqttClient.end()
					return resolve(void 0)
				})
			})

			mqttClient.on('error', (err) => {
				error(err)
				reject(err)
			})
		})
	}

export const steps = (
	bridgeInfo: Settings,
	db: DynamoDBClient,
): StepRunner<World & Record<string, string>>[] => [
	createDeviceForModel({ db }),
	publishDeviceMessage(bridgeInfo),
]
