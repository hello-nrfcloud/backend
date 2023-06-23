import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { registerDevice } from '../../devices/registerDevice.js'
import { apiClient } from '../../nrfcloud/apiClient.js'
import { getAPISettings } from '../../nrfcloud/settings.js'
import { run } from '../../util/run.js'
import { ulid } from '../../util/ulid.js'
import { ensureCertificateDir } from '../certificates.js'
import { createCA, createDeviceCertificate } from '../createCertificate.js'
import type { CommandDefinition } from './CommandDefinition.js'

export const registerSimulatorDeviceCommand = ({
	ssm,
	stackName,
	db,
	devicesTableName,
}: {
	ssm: SSMClient
	stackName: string
	db: DynamoDBClient
	devicesTableName: string
}): CommandDefinition => ({
	command: 'register-simulator-device',
	action: async () => {
		const { apiKey, apiEndpoint } = await getAPISettings({
			ssm,
			stackName,
		})()

		const client = apiClient({
			endpoint: apiEndpoint,
			apiKey,
		})

		const dir = ensureCertificateDir()

		// CA certificate
		const caCertificates = await createCA(dir)
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

		console.log(
			chalk.yellow(
				'Signed device certificate',
				chalk.blue(deviceCertificates.signedCert),
			),
		)
		console.log(
			await run({
				command: 'openssl',
				args: ['x509', '-text', '-noout', '-in', deviceCertificates.signedCert],
			}),
		)

		const registration = await client.registerDevices([
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

		if ('success' in registration && registration.success === false) {
			console.error(chalk.red(`Registration failed`))
			process.exit(1)
		}

		console.log(
			chalk.green(`Registered device with nRF Cloud`),
			chalk.cyan(deviceId),
		)

		const fingerprint = `29a.${generateCode()}`
		const res = await registerDevice({
			db,
			devicesTableName,
		})({
			id: deviceId,
			model: 'PCA20035+solar',
			fingerprint,
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

const generateCode = (len = 6) => {
	const alphabet = 'abcdefghijkmnpqrstuvwxyz' // Removed o,l
	const numbers = '23456789' // Removed 0,1
	const characters = `${alphabet}${numbers}`

	let code = ``
	for (let n = 0; n < len; n++) {
		code = `${code}${characters[Math.floor(Math.random() * characters.length)]}`
	}
	return code
}
