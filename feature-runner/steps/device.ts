import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import {
	codeBlockOrThrow,
	matchGroups,
	noMatch,
	type StepRunResult,
	type StepRunner,
	type StepRunnerArgs,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import assert from 'assert/strict'
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

const createDeviceForModel =
	({
		db,
		devicesTable,
		devicesTableFingerprintIndexName,
	}: {
		db: DynamoDBClient

		devicesTable: string
		devicesTableFingerprintIndexName: string
	}) =>
	async ({
		step,
		log: {
			step: { progress },
		},
		context,
	}: StepRunnerArgs<Record<string, string>>): Promise<StepRunResult> => {
		const match = matchGroups(
			Type.Object({
				model: Type.String(),
				storageName: Type.String(),
			}),
		)(
			/^I have the fingerprint for a `(?<model>[^`]+)` device in `(?<storageName>[^`]+)`$/,
			step.title,
		)
		if (match === null) return noMatch

		const { model, storageName } = match
		const fingerprint = `92b.${generateCode()}`
		const id = randomUUID()

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
		context[`${storageName}_deviceId`] = id

		progress(`Device registered: ${fingerprint} (${id})`)
	}

const getDevice =
	({ db, devicesTable }: { db: DynamoDBClient; devicesTable: string }) =>
	async ({
		step,
		log: {
			step: { progress },
		},
	}: StepRunnerArgs<Record<string, any>>): Promise<StepRunResult> => {
		const match = matchGroups(
			Type.Object({
				key: Type.String(),
			}),
		)(/^The device id `(?<key>[^`]+)` should equal$/, step.title)

		if (match === null) return noMatch

		progress(`Get data with id ${match.key} from ${devicesTable}`)
		const res = await db.send(
			new GetItemCommand({
				TableName: devicesTable,
				Key: {
					deviceId: { S: match.key ?? '' },
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
	(nRFCloudSettings: Settings) =>
	async ({
		step,
		log: {
			step: { progress, error },
		},
	}: StepRunnerArgs<Record<string, any>>): Promise<StepRunResult> => {
		const match = matchGroups(
			Type.Object({
				id: Type.String(),
				topic: Type.String(),
			}),
		)(
			/^the device `(?<id>[^`]+)` publishes this message to the topic `(?<topic>[^`]+)`$/,
			step.title,
		)
		if (match === null) return noMatch

		const message = JSON.parse(codeBlockOrThrow(step).code)

		progress(`Device id ${match.id} publishes to topic ${match.topic}`)
		await new Promise((resolve, reject) => {
			const mqttClient = mqtt.connect({
				host: nRFCloudSettings.mqttEndpoint,
				port: 8883,
				protocol: 'mqtts',
				protocolVersion: 4,
				clean: true,
				clientId: match.id,
				key: nRFCloudSettings.accountDevicePrivateKey,
				cert: nRFCloudSettings.accountDeviceClientCert,
				ca: readFileSync(
					path.join(process.cwd(), 'data', 'AmazonRootCA1.pem'),
					'utf-8',
				),
			})

			mqttClient.on('connect', () => {
				progress('connected')
				const topic = `${nRFCloudSettings.mqttTopicPrefix}${match.topic}`
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
	nRFCloudSettings: Settings,
	db: DynamoDBClient,
	{
		devicesTableFingerprintIndexName,
		devicesTable,
	}: { devicesTableFingerprintIndexName: string; devicesTable: string },
): StepRunner<Record<string, string>>[] => [
	createDeviceForModel({ db, devicesTableFingerprintIndexName, devicesTable }),
	getDevice({ db, devicesTable }),
	publishDeviceMessage(nRFCloudSettings),
]
