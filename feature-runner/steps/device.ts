import {
	DeleteItemCommand,
	DynamoDBClient,
	GetItemCommand,
	ScanCommand,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import {
	codeBlockOrThrow,
	noMatch,
	type StepRunResult,
	type StepRunner,
	type StepRunnerArgs,
} from '@nordicsemiconductor/bdd-markdown'
import assert from 'assert/strict'
import mqtt from 'mqtt'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import pRetry from 'p-retry'
import { getDevice as getDeviceFromIndex } from '../../devices/getDevice.js'
import { getModelForDevice } from '../../devices/getModelForDevice.js'
import { registerDevice } from '../../devices/registerDevice.js'
import type { Settings } from '../../nrfcloud/settings.js'
import type { World } from '../run-features.js'

const createDevice =
	({ db }: { db: DynamoDBClient }) =>
	async ({
		step,
		log: {
			step: { progress },
		},
		context: { devicesTable, devicesTableFingerprintIndexName },
	}: StepRunnerArgs<World>): Promise<StepRunResult> => {
		const match =
			/^a `(?<model>[^`]+)` device with the ID `(?<id>[^`]+)` is registered with the fingerprint `(?<fingerprint>[^`]+)`$/.exec(
				step.title,
			)
		if (match === null) return noMatch
		const { id, model, fingerprint } = match.groups as {
			id: string
			model: string
			fingerprint: string
		}

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

		progress(`Device registered: ${id}`)
	}
const getDevice =
	({ db }: { db: DynamoDBClient }) =>
	async ({
		step,
		log: {
			step: { progress },
		},
		context: { devicesTable },
	}: StepRunnerArgs<World>): Promise<StepRunResult> => {
		const match =
			/^The device id `(?<key>[^`]+)` should equal to this JSON$/.exec(
				step.title,
			)
		if (match === null) return noMatch

		progress(`Get data with id ${match.groups?.key} from ${devicesTable}`)
		const res = await db.send(
			new GetItemCommand({
				TableName: devicesTable,
				Key: {
					deviceId: { S: match.groups?.key ?? '' },
				},
			}),
		)

		progress(
			`Data returned from query: `,
			JSON.stringify(res.Item ?? {}, null, 2),
		)
		assert.deepEqual(
			unmarshall(res.Item ?? {}),
			JSON.parse(codeBlockOrThrow(step).code),
		)
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
			/^a device with id `(?<id>[^`]+)` publishes to topic `(?<topic>[^`]+)` with a message as this JSON$/.exec(
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

const waitForScheduler = async ({
	step,
	log: {
		step: { progress },
	},
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match = /^wait for `(?<time>\d+)` seconds?$/.exec(step.title)
	if (match === null) return noMatch

	const waitingTime = Number(match.groups?.time ?? 1)

	progress(`Waiting for ${waitingTime} seconds`)
	await setTimeout(waitingTime * 1000)
}

export const deviceStepRunners = (
	bridgeInfo: Settings,
	db: DynamoDBClient,
	devicesTable: string,
): {
	steps: StepRunner<World>[]
	cleanup: () => Promise<void>
} => ({
	steps: [
		createDevice({ db }),
		getDevice({ db }),
		waitForScheduler,
		publishDeviceMessage(bridgeInfo),
	],
	cleanup: async () => {
		const allItems = await db.send(new ScanCommand({ TableName: devicesTable }))
		for (const item of allItems?.Items ?? []) {
			await db.send(
				new DeleteItemCommand({
					TableName: devicesTable,
					Key: { deviceId: { S: item['deviceId']?.S ?? '' } },
				}),
			)
		}
	},
})
