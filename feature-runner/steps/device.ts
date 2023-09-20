import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
	codeBlockOrThrow,
	regExpMatchedStep,
	type StepRunner,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import mqtt from 'mqtt'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import pRetry from 'p-retry'
import { generateCode } from '../../cli/devices/generateCode.js'
import { getDevice as getDeviceFromIndex } from '../../devices/getDevice.js'
import { getAttributesForDevice } from '../../devices/getAttributesForDevice.js'
import { registerDevice } from '../../devices/registerDevice.js'
import type { getAllAccountsSettings } from '../../nrfcloud/allAccounts.js'
import { registerUnsupportedDevice } from '../../devices/registerUnsupportedDevice.js'

const createDeviceForModel = ({
	db,
	devicesTable,
	devicesTableFingerprintIndexName,
}: {
	db: DynamoDBClient

	devicesTable: string
	devicesTableFingerprintIndexName: string
}) =>
	regExpMatchedStep(
		{
			regExp:
				/^I have the fingerprint for a `(?<model>[^`]+)` device(?<maybeaccount> in the `(?<account>[^`]+)` account)? in `(?<storageName>[^`]+)`$/,
			schema: Type.Object({
				model: Type.String(),
				storageName: Type.String(),
				account: Type.Optional(Type.String()),
			}),
		},
		async ({
			match: { model, account: maybeAccount, storageName },
			log: { progress },
			context,
		}) => {
			const account = maybeAccount ?? 'acme'
			const fingerprint = `92b.${generateCode()}`
			const id = randomUUID()

			progress(
				`Registering device ${id} of ${account} account into table ${devicesTable}`,
			)
			await registerDevice({ db, devicesTableName: devicesTable })({
				id,
				model,
				fingerprint,
				account,
			})

			await waitForDeviceToBeAvailable({
				db,
				devicesTable,
				devicesTableFingerprintIndexName,
			})(fingerprint)
			await waitForDeviceAttributesToBeAvailable({
				db,
				devicesTable,
			})(id)

			context[storageName] = fingerprint
			context[`${storageName}_deviceId`] = id
			progress(`Device registered: ${fingerprint} (${id})`)
		},
	)

const waitForDeviceToBeAvailable =
	({
		db,
		devicesTable,
		devicesTableFingerprintIndexName,
	}: {
		db: DynamoDBClient
		devicesTable: string
		devicesTableFingerprintIndexName: string
	}) =>
	async (fingerprint: string) => {
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
	}

const waitForDeviceAttributesToBeAvailable =
	({ db, devicesTable }: { db: DynamoDBClient; devicesTable: string }) =>
	async (id: string) => {
		await pRetry(
			async () => {
				const res = await getAttributesForDevice({
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
	}

const createUnsupportedDevice = ({
	db,
	devicesTable,
	devicesTableFingerprintIndexName,
}: {
	db: DynamoDBClient

	devicesTable: string
	devicesTableFingerprintIndexName: string
}) =>
	regExpMatchedStep(
		{
			regExp:
				/^I have the fingerprint for an unsupported device in `(?<storageName>[^`]+)`$/,
			schema: Type.Object({
				storageName: Type.String(),
			}),
		},
		async ({ match: { storageName }, log: { progress }, context }) => {
			const fingerprint = `92b.${generateCode()}`
			const id = randomUUID()

			progress(
				`Registering unsupported device ${id} into table ${devicesTable}`,
			)
			await registerUnsupportedDevice({ db, devicesTableName: devicesTable })({
				id,
				fingerprint,
			})
			await waitForDeviceToBeAvailable({
				db,
				devicesTable,
				devicesTableFingerprintIndexName,
			})(fingerprint)

			context[storageName] = fingerprint
			context[`${storageName}_deviceId`] = id
			progress(`Device registered: ${fingerprint} (${id})`)
		},
	)

const publishDeviceMessage = (
	allAccountSettings: Awaited<
		ReturnType<Awaited<ReturnType<typeof getAllAccountsSettings>>>
	>,
) =>
	regExpMatchedStep(
		{
			regExp:
				/^the device `(?<id>[^`]+)` publishes this message to the topic `(?<topic>[^`]+)`$/,
			schema: Type.Object({
				id: Type.String(),
				topic: Type.String(),
			}),
		},
		async ({ match: { id, topic }, log: { progress, error }, step }) => {
			const message = JSON.parse(codeBlockOrThrow(step).code)

			const nRFCloudSettings = allAccountSettings['acme']?.nrfCloudSettings
			if (nRFCloudSettings === undefined) {
				throw new Error('No default nRF Cloud settings (acme)')
			}

			progress(`Device id ${id} publishes to topic ${topic}`)
			await new Promise((resolve, reject) => {
				const mqttClient = mqtt.connect({
					host: nRFCloudSettings.mqttEndpoint,
					port: 8883,
					protocol: 'mqtts',
					protocolVersion: 4,
					clean: true,
					clientId: id,
					key: nRFCloudSettings.accountDevicePrivateKey,
					cert: nRFCloudSettings.accountDeviceClientCert,
					ca: readFileSync(
						path.join(process.cwd(), 'data', 'AmazonRootCA1.pem'),
						'utf-8',
					),
				})

				mqttClient.on('connect', () => {
					progress('connected')
					const mqttTopic = `${nRFCloudSettings.mqttTopicPrefix}${topic}`
					progress('publishing', message, mqttTopic)
					mqttClient.publish(mqttTopic, JSON.stringify(message), (error) => {
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
		},
	)

export const steps = (
	allAccountSettings: Awaited<
		ReturnType<Awaited<ReturnType<typeof getAllAccountsSettings>>>
	>,
	db: DynamoDBClient,
	{
		devicesTableFingerprintIndexName,
		devicesTable,
	}: { devicesTableFingerprintIndexName: string; devicesTable: string },
): StepRunner<Record<string, string>>[] => [
	createDeviceForModel({ db, devicesTableFingerprintIndexName, devicesTable }),
	createUnsupportedDevice({
		db,
		devicesTableFingerprintIndexName,
		devicesTable,
	}),
	publishDeviceMessage(allAccountSettings),
]
