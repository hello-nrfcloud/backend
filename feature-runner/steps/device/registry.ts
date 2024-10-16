import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { regExpMatchedStep, type StepRunner } from '@bifravst/bdd-markdown'
import { IMEI } from '@hello.nrfcloud.com/bdd-markdown-steps/random'
import { generateCode } from '@hello.nrfcloud.com/proto/fingerprint'
import { Type } from '@sinclair/typebox'
import { randomUUID } from 'node:crypto'
import pRetry from 'p-retry'
import { getAttributesForDevice } from '../../../devices/getAttributesForDevice.js'
import { getDeviceByFingerprint } from '../../../devices/getDeviceByFingerprint.js'
import { registerDevice } from '../../../devices/registerDevice.js'
import { registerUnsupportedDevice } from '../../../devices/registerUnsupportedDevice.js'
import { NRF_CLOUD_ACCOUNT } from '../../../settings/account.js'

export const createDeviceForModel = ({
	db,
	devicesTable,
	devicesTableFingerprintIndexName,
}: {
	db: DynamoDBClient
	devicesTable: string
	devicesTableFingerprintIndexName: string
}): StepRunner<Record<string, string>> =>
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
			const account = maybeAccount ?? NRF_CLOUD_ACCOUNT
			const fingerprint = `92b.${generateCode()}`
			const id = `oob-${IMEI()}`

			progress(
				`Registering device ${id} of ${account} account into table ${devicesTable}`,
			)
			await registerDevice({ db, devicesTableName: devicesTable })({
				id,
				model,
				fingerprint,
				account,
				hwVersion: '0.0.0-development',
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
				const res = await getDeviceByFingerprint({
					db,
					DevicesTableName: devicesTable,
					DevicesIndexName: devicesTableFingerprintIndexName,
				})(fingerprint)
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
export const createUnsupportedDevice = ({
	db,
	devicesTable,
	devicesTableFingerprintIndexName,
}: {
	db: DynamoDBClient

	devicesTable: string
	devicesTableFingerprintIndexName: string
}): StepRunner<Record<string, string>> =>
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

export const steps = (
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
]
