import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
	regExpMatchedStep,
	type StepRunner,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import { randomUUID } from 'node:crypto'
import pRetry from 'p-retry'
import { generateCode } from '@hello.nrfcloud.com/proto/fingerprint'
import { getDevice as getDeviceFromIndex } from '../../../devices/getDevice.js'
import { getAttributesForDevice } from '../../../devices/getAttributesForDevice.js'
import { registerDevice } from '../../../devices/registerDevice.js'
import { registerUnsupportedDevice } from '../../../devices/registerUnsupportedDevice.js'
import { IMEI } from '@hello.nrfcloud.com/bdd-markdown-steps/random'

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
			const account = maybeAccount ?? 'nordic'
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
