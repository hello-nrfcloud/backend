import { type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import type { SSMClient } from '@aws-sdk/client-ssm'
import { devices as devicesApi } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { getAPISettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import chalk from 'chalk'
import { chunk } from 'lodash-es'
import { table } from 'table'
import { getByDeviceIds } from '../../devices/getByDeviceIds.ts'
import { compareLists } from '../../devices/import/compareLists.ts'
import { readDeviceCertificates } from '../../devices/import/readDeviceCertificates.ts'
import { readDevicesList } from '../../devices/import/readDevicesList.ts'
import { registerDevice } from '../../devices/registerDevice.ts'
import type { CommandDefinition } from './CommandDefinition.ts'

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
			flags: '-w, --windows',
			description: `Use Windows line ends`,
		},
		{
			flags: '-d, --dry-run',
			description: `Only verify the device list and certificates`,
		},
	],
	action: async (
		account,
		model,
		devicesListFile,
		certificatesZipFile,
		{ windows, dryRun },
	) => {
		const devices = await readDevicesList(
			devicesListFile,
			model,
			windows === true ? '\r\n' : '\n',
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
			const l1 = new Set(Array.from(devices.keys()))
			const l2 = new Set(Array.from(deviceCertificates.keys()))
			console.error(chalk.red(`Device lists do not match!`))
			console.error(chalk.red(`Mismatched devices:`))
			for (const d of [
				...new Set([...l1.difference(l2), ...l2.difference(l1)]),
			]) {
				console.error(chalk.red('-'), chalk.redBright(d))
			}
			process.exit(1)
		}

		console.log(chalk.green(`Device list and certificates match.`))

		if (devices.size === 0) {
			console.error(chalk.red(`No devices found in`))
			console.error(devicesListFile)
			process.exit(1)
		}

		const byIds = getByDeviceIds({ db, DevicesTableName: devicesTableName })
		const existing = await byIds(
			Array.from(devices.keys()).map((imei) => `oob-${imei}`),
		)
		const existingDevices = Object.keys(existing)

		console.log(
			table(
				[
					['Fingerprint', 'Device ID', 'Model', 'HW version'],
					...Array.from(devices.entries()).map(
						([imei, { fingerprint, hwVersion }]) => [
							chalk.green(fingerprint),
							chalk.blue(imei),
							chalk.blue(model),
							chalk.blue(hwVersion),
						],
					),
				],
				{
					singleLine: true,
				},
			),
		)

		if (existingDevices.length > 0) {
			console.warn(
				chalk.yellow(
					`Re-importing certificates for`,
					existingDevices.length,
					`devices which are already registered.`,
				),
			)
			console.warn('')
			console.warn(
				table(
					[
						['Device ID'],
						...existingDevices.map((imei) => [chalk.yellow(imei)]),
					],
					{
						singleLine: true,
					},
				),
			)
		}

		if (dryRun === true) {
			console.log(chalk.gray(`Dry run, not registering devices.`))
			process.exit(2)
		}

		const { apiKey, apiEndpoint } = await getAPISettings({
			ssm,
			stackName,
			account,
		})()

		const client = devicesApi({
			endpoint: apiEndpoint,
			apiKey,
		})

		for (const page of chunk([...deviceCertificates.entries()], 1000)) {
			// Bulk-ops API allows max 1,000 devices per request
			const registration = await client.register(
				Array.from(page).map(([imei, { certificate: certPem }]) => {
					const deviceId = `oob-${imei}`
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
		}

		const r = registerDevice({
			db,
			devicesTableName,
		})

		for (const [imei, { fingerprint, hwVersion }] of devices
			.entries()
			.filter(([imei]) => !existingDevices.includes(`oob-${imei}`))) {
			const deviceId = `oob-${imei}`

			const res = await r({
				id: deviceId,
				model,
				fingerprint,
				account,
				hwVersion,
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
