import { type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import type { SSMClient } from '@aws-sdk/client-ssm'
import { inspectString } from '@hello.nrfcloud.com/certificate-helpers/inspect'
import { devices as devicesApi } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { getAPISettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import {
	generateCode,
	isFingerprint,
} from '@hello.nrfcloud.com/proto/fingerprint'
import chalk from 'chalk'
import { readFile } from 'node:fs/promises'
import { registerDevice } from '../../devices/registerDevice.js'
import type { CommandDefinition } from './CommandDefinition.js'
import { isIMEI } from './import-devices.js'

export const importDeviceCommand = ({
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
	command: 'import-device <account> <model> <imei> <publicKeyFile>',
	options: [
		{
			flags: '-f, --fingerprint <fingerprint>',
			description: 'Use fingerprint provided instead of generating one.',
		},
	],
	action: async (account, model, imei, publicKeyFile, { fingerprint }) => {
		if (!isIMEI(imei)) {
			console.error(
				chalk.yellow('⚠️'),
				chalk.yellow(`Not an IMEI:`),
				chalk.red(JSON.stringify(imei)),
			)
			process.exit(1)
		}
		const deviceId = `oob-${imei}`
		const publicKey = await readFile(publicKeyFile, 'utf-8')
		try {
			await inspectString(publicKey)
		} catch (err) {
			console.error(err)
			console.error(
				chalk.yellow('⚠️'),
				chalk.yellow(`Not a public key:`),
				chalk.red(publicKey),
			)
			process.exit(1)
		}

		fingerprint = fingerprint ?? `29a.${generateCode()}`
		if (!isFingerprint(fingerprint)) {
			console.error(
				chalk.yellow('⚠️'),
				chalk.yellow(`Not a fingerprint:`),
				chalk.red(fingerprint),
			)
			process.exit(1)
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

		const registration = await client.register([
			{
				deviceId,
				subType: model.replace(/[^0-9a-z-]/gi, '-'),
				tags: [model.replace(/[^0-9a-z-]/gi, ':')],
				certPem: publicKey,
			},
		])

		if ('error' in registration) {
			console.error(registration.error.message)
			process.exit(1)
		}

		console.log(chalk.green(`Registered device with nRF Cloud`))
		console.log(
			chalk.yellow.dim(`Bulk ops ID:`),
			chalk.yellow(registration.bulkOpsRequestId),
		)

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
	},
	help: 'Import device with local certificate',
})
