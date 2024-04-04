import { type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import type { SSMClient } from '@aws-sdk/client-ssm'
import {
	atHostHexfile,
	connect,
	createPrivateKeyAndCSR,
	flashCertificate,
	getIMEI,
} from '@nordicsemiconductor/firmware-ci-device-helpers'
import type { Environment } from 'aws-cdk-lib'
import chalk from 'chalk'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { registerDevice } from '../../devices/registerDevice.js'
import { devices } from '../../nrfcloud/devices.js'
import { getAPISettings } from '../../nrfcloud/settings.js'
import { fingerprintGenerator } from '@hello.nrfcloud.com/proto/fingerprint'
import type { CommandDefinition } from './CommandDefinition.js'
import { toPEM } from '@hello.nrfcloud.com/certificate-helpers/der'
import {
	deviceCertificateLocations,
	ensureCertificateDir,
} from '@hello.nrfcloud.com/certificate-helpers/locations'
import { signDeviceCertificate } from '@hello.nrfcloud.com/certificate-helpers/device'
import { ensureProductionRunCACertificate } from '@hello.nrfcloud.com/certificate-helpers/production'

export const defaultPort = '/dev/ttyACM0'

export const provisionDkCommand = ({
	ssm,
	db,
	devicesTableName,
	stackName,
	env,
}: {
	ssm: SSMClient
	db: DynamoDBClient
	devicesTableName: string
	stackName: string
	env: Required<Environment>
}): CommandDefinition => ({
	command: 'provision-dk <account> <productionRunNumber> <model>',
	options: [
		{
			flags: '-p, --port <port>',
			description: `The port the device is connected to, defaults to ${defaultPort}`,
		},
		{
			flags: '--dk',
			description: `Connected device is a 9160 DK`,
		},
		{
			flags: '-a, --at-host <atHost>',
			description: `Flash at_host from this file`,
		},
		{
			flags: '--debug',
			description: `Log debug messages`,
		},
		{
			flags: '-X, --delete-private-key',
			description: `Delete the private key (needed if a private key exists with the secTag)`,
		},
	],
	action: async (
		account,
		productionRunNumber,
		model,
		{ port, dk, atHost, debug, deletePrivateKey },
	) => {
		const productionRun = parseInt(productionRunNumber, 10)
		const dir = ensureCertificateDir(env)
		const {
			privateKey: caPrivateKeyLocation,
			certificate: caCertificateLocation,
		} = await ensureProductionRunCACertificate(dir, productionRun)

		console.log(
			chalk.magenta(`Flashing certificate`),
			chalk.blue(port ?? defaultPort),
		)
		const connection = (
			await connect({
				atHostHexfile:
					atHost ??
					(dk === true ? atHostHexfile['9160dk'] : atHostHexfile['thingy91']),
				device: port ?? defaultPort,
				warn: (...args) =>
					chalk.yellow('⚠️', ...args.map((s) => chalk.yellow(s))),
				debug: debug === true ? console.debug : undefined,
				progress: debug === true ? console.log : undefined,
				inactivityTimeoutInSeconds: 10,
			})
		).connection

		const imei = await getIMEI({ at: connection.at })
		const deviceId = `oob-${imei}`

		console.log(chalk.magenta(`IMEI`), chalk.blue(deviceId))

		const csr = await createPrivateKeyAndCSR({
			at: connection.at,
			secTag: 42,
			deletePrivateKey: deletePrivateKey ?? false,
			attributes: ({ imei }) => `CN=oob-${imei}`,
		})

		const { CSR: deviceCSRLocation, signedCert: deviceSignedCertLocation } =
			deviceCertificateLocations(dir, deviceId)

		const deviceCSRLocationDer = `${deviceCSRLocation}.der`
		await writeFile(deviceCSRLocationDer, csr)

		await toPEM(deviceCSRLocationDer, deviceCSRLocation)

		console.log(chalk.gray('CSR written to'), chalk.blue(deviceCSRLocation))

		await signDeviceCertificate({
			dir,
			deviceId,
			caCertificateLocation,
			caPrivateKeyLocation,
		})

		const caCert = await readFile(
			path.resolve(process.cwd(), 'data', 'AmazonRootCA1.pem'),
			'utf-8',
		)
		const clientCert = await readFile(deviceSignedCertLocation, 'utf-8')

		await flashCertificate({
			at: connection.at,
			caCert,
			secTag: 42,
			clientCert,
		})
		await connection.end()

		console.log()
		console.log(
			chalk.green('Certificate written to device'),
			chalk.blueBright(deviceId),
		)

		const { apiKey, apiEndpoint } = await getAPISettings({
			ssm,
			stackName,
			account,
		})()

		const client = devices({
			endpoint: apiEndpoint,
			apiKey,
		})

		const registration = await client.register([
			{
				deviceId,
				subType: model.replace(/[^0-9a-z-]/gi, '-'),
				tags: [model.replace(/[^0-9a-z-]/gi, ':')],
				certPem: await readFile(path.join(deviceSignedCertLocation), 'utf-8'),
				fwTypes: ['APP', 'MODEM'],
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

		const fingerprint = fingerprintGenerator(productionRun)()
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
			console.error(chalk.red(`Failed to store device fingerprint!`))
			console.error(res.error.message)
			process.exit(1)
		}

		console.log(
			chalk.green(`Registered device with fingerprint`),
			chalk.cyan(fingerprint),
		)

		process.exit()
	},
	help: 'Provisions a DK',
})
