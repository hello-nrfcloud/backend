import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { registerDevice } from '../../devices/registerDevice.js'
import { apiClient } from '../../nrfcloud/apiClient.js'
import { getAPISettings } from '../../nrfcloud/settings.js'
import { run } from '../../util/run.js'
import { ulid } from '../../util/ulid.js'
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

		// CA certificate
		const caPrivateKeyLocation = path.join(
			process.cwd(),
			'certificates',
			'simulator.CA.key',
		)
		const caCertificateLocation = path.join(
			process.cwd(),
			'certificates',
			'simulator.CA.pem',
		)
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

		// Device private key
		const devicePrivateKeyLocation = path.join(
			process.cwd(),
			'certificates',
			`${deviceId}.key`,
		)
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
		const deviceCertificateLocation = path.join(
			process.cwd(),
			'certificates',
			`${deviceId}.pem`,
		)
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

		// Sign device cert
		const deviceCSRLocation = path.join(
			process.cwd(),
			'certificates',
			`${deviceId}.csr`,
		)
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
		const deviceSignedCertLocation = path.join(
			process.cwd(),
			'certificates',
			`${deviceId}.signed.pem`,
		)
		await run({
			command: 'openssl',
			args: [
				'x509',
				'-req',
				'-CA',
				caCertificateLocation,
				'-CAkey',
				caPrivateKeyLocation,
				'-in',
				deviceCSRLocation,
				'-out',
				deviceSignedCertLocation,
				'-days',
				'10957',
			],
		})
		console.log(
			chalk.yellow(
				'Signed device certificate',
				chalk.blue(deviceSignedCertLocation),
			),
		)
		console.log(
			await run({
				command: 'openssl',
				args: ['x509', '-text', '-noout', '-in', deviceSignedCertLocation],
			}),
		)

		const registration = await client.registerDevices([
			{
				deviceId,
				subType: 'PCA20035-solar',
				tags: ['simulators', 'muninn-backend'],
				certPem: await readFile(path.join(deviceSignedCertLocation), 'utf-8'),
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
