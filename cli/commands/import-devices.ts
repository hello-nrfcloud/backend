import { type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import type { SSMClient } from '@aws-sdk/client-ssm'
import { devices as devicesApi } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { getAPISettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import chalk from 'chalk'
import { table } from 'table'
import { compareLists } from '../../devices/import/compareLists.js'
import { readDeviceCertificates } from '../../devices/import/readDeviceCertificates.js'
import { readDevicesList } from '../../devices/import/readDevicesList.js'
import { registerDevice } from '../../devices/registerDevice.js'
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
	command:
		'import-devices <account> <model> <devicesListFile> <certificatesZipFile>',
	options: [
		{
			flags: '-l, --linux',
			description: `Use Linux line ends`,
		},
	],
	action: async (
		account,
		model,
		devicesListFile,
		certificatesZipFile,
		{ linux },
	) => {
		const devices = await readDevicesList(
			devicesListFile,
			model,
			linux === true ? '\n' : '\r\n',
		)

		console.log(chalk.blue(`Found ${devices.size} devices in the list.`))

		const deviceCertificates = await readDeviceCertificates(certificatesZipFile)

		console.log(
			chalk.blue(`Found ${deviceCertificates.size} device certificates.`),
		)

		if (
			!compareLists(deviceCertificates, devices) ||
			!compareLists(devices, deviceCertificates)
		) {
			console.error(chalk.red(`Device lists do not match!`))
			process.exit(1)
		}

		console.log(chalk.green(`Device list and certificates match.`))

		if (devices.size === 0) {
			console.error(chalk.red(`No devices found in`))
			console.error(devicesListFile)
			process.exit(1)
		}

		console.log(
			table([
				['Fingerprint', 'Device ID'],
				...Array.from(devices.entries()).map(([imei, { fingerprint }]) => [
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
			Array.from(deviceCertificates.entries()).map(
				([imei, { certificate: certPem }]) => {
					const deviceId = `oob-${imei}`
					return {
						deviceId,
						subType: model.replace(/[^0-9a-z-]/gi, '-'),
						tags: [model.replace(/[^0-9a-z-]/gi, ':')],
						certPem,
					}
				},
			),
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

		for (const [imei, { fingerprint }] of devices.entries()) {
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
