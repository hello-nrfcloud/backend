import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import type { Environment } from 'aws-cdk-lib'
import chalk from 'chalk'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { registerDevice } from '../../devices/registerDevice.js'
import { apiClient } from '../../nrfcloud/apiClient.js'
import { getAPISettings } from '../../nrfcloud/settings.js'
import { run } from '../../util/run.js'
import { ulid } from '../../util/ulid.js'
import {
	deviceCertificateLocations,
	ensureCertificateDir,
	simulatorCALocations,
} from '../certificates.js'
import { fingerprintGenerator } from '../devices/fingerprintGenerator.js'
import { signDeviceCertificate } from '../devices/signDeviceCertificate.js'
import type { CommandDefinition } from './CommandDefinition.js'

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

		const dir = ensureCertificateDir(env)

		// CA certificate
		const {
			privateKey: caPrivateKeyLocation,
			certificate: caCertificateLocation,
		} = simulatorCALocations(dir)
		try {
			await stat(caCertificateLocation)
		} catch {
			// Create a CA private key
			await run({
				command: 'openssl',
				args: ['genrsa', '-out', caPrivateKeyLocation, '2048'],
			})
			await run({
				command: 'openssl',
				args: [
					'req',
					'-x509',
					'-new',
					'-nodes',
					'-key',
					caPrivateKeyLocation,
					'-sha256',
					'-days',
					'10957',
					'-out',
					caCertificateLocation,
					'-subj',
					'/OU=Cellular IoT Applications Team, CN=Device Simulator',
				],
			})
		}
		console.log(
			chalk.yellow('CA certificate:'),
			chalk.blue(caCertificateLocation),
		)

		const deviceId = `simulator-${ulid()}`
		console.log(chalk.yellow('Device ID:'), chalk.blue(deviceId))

		// Device certificate locations
		const {
			privateKey: devicePrivateKeyLocation,
			certificate: deviceCertificateLocation,
			CSR: deviceCSRLocation,
			signedCert: deviceSignedCertLocation,
		} = deviceCertificateLocations(dir, deviceId)

		// Device private key
		await run({
			command: 'openssl',
			args: [
				'ecparam',
				'-out',
				devicePrivateKeyLocation,
				'-name',
				'prime256v1',
				'-genkey',
			],
		})
		console.log(
			chalk.yellow('Private key:'),
			chalk.blue(devicePrivateKeyLocation),
		)

		// Device certificate
		await run({
			command: 'openssl',
			args: [
				'req',
				'-x509',
				'-new',
				'-nodes',
				'-key',
				devicePrivateKeyLocation,
				'-sha256',
				'-days',
				'10957',
				'-out',
				deviceCertificateLocation,
				'-subj',
				`/CN=${deviceId}`,
			],
		})
		console.log(
			chalk.yellow('Device certificate', chalk.blue(deviceCertificateLocation)),
		)

		// Create CSR
		await run({
			command: 'openssl',
			args: [
				'req',
				'-key',
				devicePrivateKeyLocation,
				'-new',
				'-out',
				deviceCSRLocation,
				'-subj',
				`/CN=${deviceId}`,
			],
		})

		// Sign device cert
		await signDeviceCertificate({
			dir,
			deviceId,
			caCertificateLocation,
			caPrivateKeyLocation,
		})

		const registration = await client.registerDevices([
			{
				deviceId,
				subType: 'PCA20035-solar',
				tags: ['simulators', 'hello-nrfcloud-backend'],
				certPem: await readFile(path.join(deviceSignedCertLocation), 'utf-8'),
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
