import { type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import type { SSMClient } from '@aws-sdk/client-ssm'
import { isFingerprint } from '@hello.nrfcloud.com/proto/fingerprint'
import chalk from 'chalk'
import { execSync } from 'node:child_process'
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
		const devicesList = (await readFile(provisioningList, 'utf-8'))
			.trim()
			.split('\r\n')
			.map((s) =>
				s.split(';').map((s) => s.replace(/^"/, '').replace(/"$/, '')),
			)
			.slice(1)
		const devices: [imei: string, fingerprint: string, publicKey: string][] =
			devicesList
				.map(
					([imei, _, fingerprint, publicKey]) =>
						[imei, fingerprint, (publicKey ?? '').replace(/\\n/g, os.EOL)] as [
							string,
							string,
							string,
						],
				)
				.filter(([imei, fingerprint, publicKey]) => {
					if (!isIMEI(imei)) {
						console.error(
							chalk.yellow('⚠️'),
							chalk.yellow(`Not an IMEI:`),
							chalk.red(imei),
						)
						return false
					}
					if (!isFingerprint(fingerprint)) {
						console.error(
							chalk.yellow('⚠️'),
							chalk.yellow(`Not a fingerprint:`),
							chalk.red(fingerprint),
						)
						return false
					}
					try {
						execSync('openssl x509 -text -noout', { input: publicKey })
					} catch (err) {
						console.error(err)
						console.error(
							chalk.yellow('⚠️'),
							chalk.yellow(`Not a public key:`),
							chalk.red(publicKey),
						)
						return false
					}
					return true
				})

		if (devices.length === 0) {
			console.error(chalk.red(`No devices found in`))
			console.error(devicesList)
			process.exit(1)
		}

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
				const certPem = publicKey
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

		console.log(chalk.green(`Registered devices with nRF Cloud`))
		console.log(
			chalk.yellow.dim(`Bulk ops ID:`),
			chalk.yellow(registration.bulkOpsRequestId),
		)

		for (const [imei, fingerprint] of devices) {
			const deviceId = `oob-${imei}`

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
					chalk.green(`Registered device ${deviceId} with fingerprint`),
					chalk.cyan(fingerprint),
				)
			}
		}
	},
	help: 'Import factory provisioned devices',
})

export const isIMEI = (imei?: string): imei is string =>
	/^35[0-9]{13}$/.test(imei ?? '')
