import type { SSMClient } from '@aws-sdk/client-ssm'
import type { Environment } from 'aws-cdk-lib'
import chalk from 'chalk'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { devices } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import {
	updateSettings,
	type Settings,
} from '../../settings/health-check/device.js'
import { getAPISettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import type { CommandDefinition } from './CommandDefinition.js'
import { generateCode } from '@hello.nrfcloud.com/proto/fingerprint'
import { ensureCertificateDir } from '@hello.nrfcloud.com/certificate-helpers/locations'
import { createCA } from '@hello.nrfcloud.com/certificate-helpers/ca'
import { createDeviceCertificate } from '@hello.nrfcloud.com/certificate-helpers/device'
import { inspectCert } from '@hello.nrfcloud.com/certificate-helpers/inspect'

export const createHealthCheckDevice = ({
	ssm,
	stackName,
	env,
}: {
	ssm: SSMClient
	stackName: string
	env: Required<Environment>
}): CommandDefinition => ({
	command: 'create-health-check-device <account>',
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
		const caCertificates = await createCA(dir, 'Health Check')
		console.log(
			chalk.yellow('CA certificate:'),
			chalk.blue(caCertificates.certificate),
		)

		const deviceId = `health-check-${randomUUID()}`
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
		console.log(await inspectCert(deviceCertificates.signedCert))

		const registration = await client.register([
			{
				deviceId,
				subType: 'PCA20035-solar',
				tags: ['health-check', 'simulators', 'hello-nrfcloud-backend'],
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

		const settings: Settings = {
			healthCheckClientCert: await readFile(
				path.join(deviceCertificates.signedCert),
				'utf-8',
			),
			healthCheckPrivateKey: await readFile(
				path.join(deviceCertificates.privateKey),
				'utf-8',
			),
			healthCheckClientId: deviceId,
			healthCheckModel: 'PCA20065',
			healthCheckFingerPrint: `29a.${generateCode()}`,
		}
		await updateSettings({ ssm, stackName, account })(settings)

		console.debug(chalk.white(`nRF Cloud health check device settings:`))
		Object.entries(settings).forEach(([k, v]) => {
			console.debug(chalk.yellow(`${k}:`), chalk.blue(v))
		})
	},
	help: 'Creates nRF Cloud health check device used by the stack to end-to-end health check',
})
