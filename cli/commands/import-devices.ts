import { type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import type { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import { table } from 'table'
import { registerDevice } from '../../devices/registerDevice.js'
import { apiClient } from '../../nrfcloud/apiClient.js'
import { getAPISettings } from '../../nrfcloud/settings.js'
import type { CommandDefinition } from './CommandDefinition.js'

export const importDevicesCommand = ({
	ssm,
	db,
	devicesTableName,
	stackName,
}: {
	ssm: SSMClient
	db: DynamoDBClient
	devicesTableName: string
	stackName: string
}): CommandDefinition => ({
	command: 'import-devices <model> <provisioningList>',
	action: async (model, provisioningList) => {
		const devices: [imei: string, fingerprint: string, publicKey: string][] = (
			await readFile(provisioningList, 'utf-8')
		)
			.trim()
			.split('\r\n')
			.map((s) =>
				s.split(';').map((s) => s.replace(/^"/, '').replace(/"$/, '')),
			)
			.slice(1)
			.map(
				([imei, _, fingerprint, publicKey]) =>
					[imei, fingerprint, publicKey] as [string, string, string],
			)

		console.log(
			table([
				['Fingerprint', 'Device ID'],
				...devices.map(([imei, fingerprint]) => [
					chalk.green(fingerprint),
					chalk.blue(imei),
				]),
			]),
		)

		const { apiKey, apiEndpoint } = await getAPISettings({
			ssm,
			stackName,
		})()

		const client = apiClient({
			endpoint: apiEndpoint,
			apiKey,
		})

		const registration = await client.registerDevices(
			devices.map(([imei, _, publicKey]) => {
				const deviceId = `oob-${imei}`
				const certPem = publicKey.replace(/\\n/g, os.EOL)
				return {
					deviceId,
					subType: model.replace(/[^0-9a-z-]/gi, '-'),
					tags: [model.replace(/[^0-9a-z-]/gi, ':')],
					certPem,
				}
			}),
		)

		if ('error' in registration) {
			console.error(registration.error.message)
			process.exit(1)
		}

		if ('success' in registration && registration.success === false) {
			console.error(chalk.red(`Registration failed`))
			process.exit(1)
		}

		console.log(chalk.green(`Registered devices with nRF Cloud`))

		for (const [imei, fingerprint] of devices) {
			//const deviceId = `oob-${imei}`
			const deviceId = imei

			const res = await registerDevice({
				db,
				devicesTableName,
			})({
				id: deviceId,
				model,
				fingerprint,
			})
			if ('error' in res) {
				console.error(
					chalk.red(`Failed to store ${deviceId} device fingerprint!`),
				)
				console.error(res.error.message)
			} else {
				console.log(
					chalk.green(
						`Registered device ${deviceId} with fingerprint ${fingerprint}`,
					),
					chalk.cyan(fingerprint),
				)
			}
		}
	},
	help: 'Import factory provisioned devices',
})
