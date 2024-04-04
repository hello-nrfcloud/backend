import { type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import type { SSMClient } from '@aws-sdk/client-ssm'
import { isFingerprint } from '@hello.nrfcloud.com/proto/fingerprint'
import chalk from 'chalk'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import { table } from 'table'
import { registerDevice } from '../../devices/registerDevice.js'
import { devices as devicesApi } from '../../nrfcloud/devices.js'
import { getAPISettings } from '../../nrfcloud/settings.js'
import type { CommandDefinition } from './CommandDefinition.js'
import { inspectString } from '@hello.nrfcloud.com/certificate-helpers/inspect'

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
	command: 'import-devices <account> <model> <provisioningList>',
	options: [
		{
			flags: '-w, --windows',
			description: `Use Windows line ends`,
		},
	],
	action: async (account, model, provisioningList, { windows }) => {
		const devicesList = (await readFile(provisioningList, 'utf-8'))
			.trim()
			.split(windows === true ? '\r\n' : '\n')
			.map((s) =>
				s.split(';').map((s) => s.replace(/^"/, '').replace(/"$/, '')),
			)
			.slice(1)

		let devices: [imei: string, fingerprint: string, publicKey: string][] =
			devicesList
				.map(
					([imei, fingerprint, publicKey]) =>
						[imei, fingerprint, (publicKey ?? '').replace(/\\n/g, os.EOL)] as [
							string,
							string,
							string,
						],
				)
				.filter(([imei]) => {
					if (!isIMEI(imei)) {
						console.error(
							chalk.yellow('⚠️'),
							chalk.yellow(`Not an IMEI:`),
							chalk.red(JSON.stringify(imei)),
						)
						return false
					}
					return true
				})
				.filter(([, fingerprint]) => {
					if (!isFingerprint(fingerprint)) {
						console.error(
							chalk.yellow('⚠️'),
							chalk.yellow(`Not a fingerprint:`),
							chalk.red(JSON.stringify(fingerprint)),
						)
						return false
					}
					return true
				})

		// Filter out invalid keys
		devices = (
			await Promise.all(
				devices.map(async (device) => [
					...device,
					await (async (publicKey: string) => {
						try {
							await inspectString(publicKey)
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
					})(device[2]),
				]),
			)
		)
			.filter(([, , , valid]) => valid === true)
			.map<[string, string, string]>(([imei, fingerprint, publicKey]) => [
				imei as string,
				fingerprint as string,
				publicKey as string,
			])

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
			account,
		})()

		const client = devicesApi({
			endpoint: apiEndpoint,
			apiKey,
		})

		const registration = await client.register(
			devices.map(([imei, , publicKey]) => {
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
				account,
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
