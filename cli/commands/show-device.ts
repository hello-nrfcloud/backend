import { type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { table } from 'table'
import { getDevice } from '../../devices/getDevice.js'
import { apiClient } from '../../nrfcloud/apiClient.js'
import { getAPISettings } from '../../nrfcloud/settings.js'
import type { CommandDefinition } from './CommandDefinition.js'
import { convertTonRFAccount } from '../validnRFCloudAccount.js'
import { Scope } from '../../util/settings.js'

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
		const maybeDevice = await getDevice({
			db,
			devicesTableName,
			devicesIndexName,
		})({
			fingerprint,
		})

		if ('error' in maybeDevice) {
			console.error(chalk.red('⚠️'), '', chalk.red(maybeDevice.error.message))
			process.exit(1)
		}

		const { device } = maybeDevice

		const scope = convertTonRFAccount(device.account) as unknown as
			| Scope.EXEGER_CONFIG
			| Scope.NODIC_CONFIG
		const { apiKey, apiEndpoint } = await getAPISettings({
			ssm,
			stackName,
			scope,
		})()

		const client = apiClient({
			endpoint: apiEndpoint,
			apiKey,
		})

		const maybeNrfCloudDevice = await client.getDevice(device.id)
		const account = await client.account()
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
					'device' in maybeNrfCloudDevice ? chalk.green('✅') : chalk.red('⚠️'),
					'device' in maybeNrfCloudDevice &&
					maybeNrfCloudDevice.device?.state?.reported?.connection?.status ===
						'connected'
						? chalk.green('Yes')
						: chalk.red('No'),
					`${chalk.cyanBright(account.account.team.name)} ${chalk.cyan.dim(
						account.account.team.tenantId,
					)}`,
				],
			]),
		)
	},
	help: 'Show a device',
})
