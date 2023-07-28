import { type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { isEqual } from 'lodash-es'
import { table } from 'table'
import { getDevice } from '../../devices/getDevice.js'
import { apiClient, type DeviceConfig } from '../../nrfcloud/apiClient.js'
import { getAPISettings } from '../../nrfcloud/settings.js'
import type { CommandDefinition } from './CommandDefinition.js'
import type { Nullable } from '../../util/types.js'

const defaultActiveWaitTimeSeconds = 60
const defaultLocationTimeoutSeconds = 30

export const configureDeviceCommand = ({
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
	command: 'configure-device <fingerprint>',
	options: [
		{ flags: '--passiveMode', description: `Set device in passive mode` },
		{ flags: '--disableGNSS', description: `Whether to disable GNSS` },
		{
			flags: '--activeWaitTime <activeWaitTime>',
			description: `Configure the active wait time in seconds. Defaults to ${defaultActiveWaitTimeSeconds}.`,
		},
		{
			flags: '--locationTimeout <locationTimeout>',
			description: `Configure the location timeout in seconds. Defaults to ${defaultLocationTimeoutSeconds}.`,
		},
	],
	action: async (
		fingerprint,
		{ activeWaitTime, locationTimeout, disableGNSS },
	) => {
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

		console.log(chalk.yellow('ID'), chalk.blue(device.id))

		const { apiKey, apiEndpoint } = await getAPISettings({
			ssm,
			stackName,
			account: device.account,
		})()

		const client = apiClient({
			endpoint: apiEndpoint,
			apiKey,
		})

		const maybeNrfCloudDevice = await client.getDevice(device.id)

		if ('error' in maybeNrfCloudDevice) {
			console.error(
				chalk.red('⚠️'),
				'',
				chalk.red(maybeNrfCloudDevice.error.message),
			)
			process.exit(1)
		}

		const {
			device: { state },
		} = maybeNrfCloudDevice

		console.log(
			chalk.yellow('Firmware version'),
			chalk.blue(state?.reported?.device?.deviceInfo?.appVersion),
		)
		console.log(chalk.yellow('Shadow version'), chalk.blue(state?.version))

		const configKeys = [
			...new Set([
				...Object.keys(state?.reported?.config ?? {}),
				...Object.keys(state?.desired?.config ?? {}),
			]),
		] as (keyof DeviceConfig)[]

		console.log(
			table(
				[
					['Current configuration', 'Reported', 'Desired'],
					...configKeys.map((k) => {
						const reportedValue = state?.reported?.config?.[k]
						const desiredValue = state?.desired?.config?.[k]
						const diff =
							desiredValue !== undefined &&
							(k === 'nod'
								? !isEqual(desiredValue, reportedValue)
								: desiredValue !== reportedValue)
						return [
							chalk.yellow(k),
							(diff ? chalk.red : chalk.green)(
								k === 'nod'
									? ((reportedValue as string[]) ?? []).join(', ')
									: reportedValue ?? '-',
							),
							chalk.cyan(
								k === 'nod'
									? ((desiredValue as string[]) ?? []).join(', ')
									: desiredValue ?? '-',
							),
						]
					}),
				],
				{
					drawHorizontalLine: (lineIndex, rowCount) =>
						lineIndex === 0 || lineIndex === 1 || lineIndex === rowCount,
				},
			),
		)

		const newConfig: Nullable<DeviceConfig> = {
			activeMode: true,
			activeWaitTime:
				activeWaitTime !== undefined
					? parseInt(activeWaitTime, 10)
					: defaultActiveWaitTimeSeconds,
			locationTimeout:
				locationTimeout !== undefined
					? parseInt(locationTimeout, 10)
					: defaultLocationTimeoutSeconds,
			nod: disableGNSS === true ? ['gnss'] : null,
		}
		console.log(
			table(
				[
					['New configuration', ''],
					...Object.entries(newConfig).map(([k, v]) => [
						chalk.yellow(k),
						chalk.blue(JSON.stringify(v)),
					]),
				],
				{
					drawHorizontalLine: (lineIndex, rowCount) =>
						lineIndex === 0 || lineIndex === 1 || lineIndex === rowCount,
				},
			),
		)
		const res = await client.updateConfig(
			device.id,
			state?.version ?? 0,
			newConfig,
		)

		if ('error' in res) {
			console.error(chalk.red(`Updated failed: ${res.error}.`))
		} else {
			console.log(chalk.green('Updated configuration.'))
		}
	},
	help: 'Apply configuration presets to a device',
})
