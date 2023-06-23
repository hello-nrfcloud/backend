import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { apiClient } from '../../nrfcloud/apiClient.js'
import {
	updateSettings,
	type Settings,
} from '../../nrfcloud/healthCheckSettings.js'
import { getAPISettings } from '../../nrfcloud/settings.js'
import { run } from '../../util/run.js'
import { ensureCertificateDir } from '../certificates.js'
import { createCA, createDeviceCertificate } from '../createCertificate.js'
import type { CommandDefinition } from './CommandDefinition.js'

export const createHealthCheckDevice = ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): CommandDefinition => ({
	command: 'create-health-check-device',
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

		const deviceId = `health-check`
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
			healthCheckClientId: 'health-check',
			healthCheckModel: 'PCA20035+solar',
			healthCheckFingerPrint: '29a.ch3ckr',
		}
		await updateSettings({ ssm, stackName })(settings)

		console.debug(chalk.white(`nRF Cloud health check device settings:`))
		Object.entries(settings).forEach(([k, v]) => {
			console.debug(chalk.yellow(`${k}:`), chalk.blue(v))
		})
	},
	help: 'Creates nRF Cloud health check device used by the stack to end-to-end health check',
})
