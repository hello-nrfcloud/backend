import { type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { table } from 'table'
import { getAPISettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import type { CommandDefinition } from './CommandDefinition.js'
import { UNSUPPORTED_MODEL } from '../../devices/registerUnsupportedDevice.js'
import {
	getAccountInfo,
	devices,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { getDeviceByFingerprint } from '../../devices/getDeviceByFingerprint.js'

export const showDeviceCommand = ({
	ssm,
	db,
	devicesTableName,
	devicesIndexName,
	stackName,
}: {
	ssm: SSMClient
	db: DynamoDBClient
	devicesTableName: string
	devicesIndexName: string
	stackName: string
}): CommandDefinition => ({
	command: 'show-device <fingerprint>',
	action: async (fingerprint) => {
		const maybeDevice = await getDeviceByFingerprint({
			db,
			DevicesTableName: devicesTableName,
			DevicesIndexName: devicesIndexName,
		})(fingerprint)

		if ('error' in maybeDevice) {
			console.error(chalk.red('⚠️'), '', chalk.red(maybeDevice.error.message))
			process.exit(1)
		}

		const { device } = maybeDevice

		if (device.model === UNSUPPORTED_MODEL || device.account === undefined) {
			console.log(
				table([
					['Fingerprint', 'Device ID', 'Model'],
					[
						chalk.green(device.fingerprint),
						chalk.blue(device.id),
						chalk.magenta(device.model),
					],
				]),
			)
			return
		}

		const { apiKey, apiEndpoint } = await getAPISettings({
			ssm,
			stackName,
			account: device.account,
		})()

		const client = devices({
			endpoint: apiEndpoint,
			apiKey,
		})

		const maybeNrfCloudDevice = await client.get(device.id)

		const account = await getAccountInfo({ endpoint: apiEndpoint, apiKey })
		if ('error' in account) {
			console.error(chalk.red('⚠️'), '', chalk.red(account.error.message))
			process.exit(1)
		}

		console.log(
			table([
				[
					'Fingerprint',
					'Device ID',
					'Model',
					'nRF Cloud',
					'Connected',
					'nRF Cloud Account',
				],
				[
					chalk.green(device.fingerprint),
					chalk.blue(device.id),
					chalk.magenta(device.model),
					'result' in maybeNrfCloudDevice ? chalk.green('✅') : chalk.red('⚠️'),
					'result' in maybeNrfCloudDevice &&
					maybeNrfCloudDevice.result?.state?.reported?.connection?.status ===
						'connected'
						? chalk.green('Yes')
						: chalk.red('No'),
					`${chalk.cyanBright(account.team.name)} ${chalk.cyan.dim(
						account.team.tenantId,
					)}`,
				],
			]),
		)
	},
	help: 'Show a device',
})
