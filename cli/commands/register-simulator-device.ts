import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import type { Environment } from 'aws-cdk-lib'
import chalk from 'chalk'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { registerDevice } from '../../devices/registerDevice.js'
import { devices } from '../../nrfcloud/devices.js'
import { getAPISettings } from '../../nrfcloud/settings.js'
import { ulid } from '../../util/ulid.js'
import { fingerprintGenerator } from '@hello.nrfcloud.com/proto/fingerprint'
import type { CommandDefinition } from './CommandDefinition.js'
import { inspectCert } from '@hello.nrfcloud.com/certificate-helpers/inspect'
import { createDeviceCertificate } from '@hello.nrfcloud.com/certificate-helpers/device'
import { createCA } from '@hello.nrfcloud.com/certificate-helpers/ca'
import { ensureCertificateDir } from '@hello.nrfcloud.com/certificate-helpers/locations'

export const registerSimulatorDeviceCommand = ({
	ssm,
	stackName,
	db,
	devicesTableName,
	env,
}: {
	ssm: SSMClient
	stackName: string
	db: DynamoDBClient
	devicesTableName: string
	env: Required<Environment>
}): CommandDefinition => ({
	command: 'register-simulator-device <account>',
	action: async (account) => {
		const { apiKey, apiEndpoint } = await getAPISettings({
			ssm,
			stackName,
			account,
		})()

		const client = devices({
			endpoint: apiEndpoint,
			apiKey,
		})

		const dir = ensureCertificateDir(env)

		// CA certificate
		const caCertificates = await createCA(dir, 'Device Simulator')
		console.log(
			chalk.yellow('CA certificate:'),
			chalk.blue(caCertificates.certificate),
		)

		const deviceId = `simulator-${ulid()}`
		console.log(chalk.yellow('Device ID:'), chalk.blue(deviceId))

		// Device private key
		const deviceCertificates = await createDeviceCertificate({
			dest: dir,
			caCertificates,
			deviceId,
		})
		console.log(
			chalk.yellow('Private key:'),
			chalk.blue(deviceCertificates.privateKey),
		)
		console.log(
			chalk.yellow(
				'Device certificate',
				chalk.blue(deviceCertificates.certificate),
			),
		)
		console.log(await inspectCert(deviceCertificates.signedCert))

		const registration = await client.register([
			{
				deviceId,
				subType: 'PCA20035-solar',
				tags: ['simulators', 'hello-nrfcloud-backend'],
				certPem: await readFile(
					path.join(deviceCertificates.signedCert),
					'utf-8',
				),
			},
		])

		if ('error' in registration) {
			console.error(registration.error.message)
			process.exit(1)
		}

		console.log(
			chalk.green(`Registered device with nRF Cloud`),
			chalk.cyan(deviceId),
		)
		console.log(
			chalk.yellow.dim(`Bulk ops ID:`),
			chalk.yellow(registration.bulkOpsRequestId),
		)

		const fingerprint = fingerprintGenerator(666)()
		const res = await registerDevice({
			db,
			devicesTableName,
		})({
			id: deviceId,
			model: 'PCA20035+solar',
			fingerprint,
			account,
		})
		if ('error' in res) {
			console.error(chalk.red(`Failed to store device fingerprint!`))
			console.error(res.error.message)
			process.exit(1)
		}

		console.log(
			chalk.green(`Registered device with fingerprint`),
			chalk.cyan(fingerprint),
		)

		console.log()
		console.log(chalk.white('You can now connect the simulator using'))
		console.log(chalk.magenta('./cli.sh simulate-device'), chalk.blue(deviceId))
	},
	help: 'Registers a device simulator',
})
