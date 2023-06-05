import { IoTClient } from '@aws-sdk/client-iot'
import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import fs from 'node:fs'
import { getIoTEndpoint } from '../../aws/getIoTEndpoint.js'
import { STACK_NAME } from '../../cdk/stacks/stackConfig.js'
import { createAccountDevice } from '../../nrfcloud/createAccountDevice.js'
import { deleteAccountDevice } from '../../nrfcloud/deleteNrfcloudCredentials.js'
import { getAccountInfo } from '../../nrfcloud/getAccountInfo.js'
import {
	getSettings,
	updateSettings,
	type Settings,
} from '../../nrfcloud/settings.js'
import { slashless } from '../../util/slashless.js'
import type { CommandDefinition } from './CommandDefinition'

const defaultApiEndpoint = new URL('https://api.nrfcloud.com')

const apiKeyAction = async (
	apiKey: string,
	{
		reset,
		endpoint,
		iot,
		ssm,
	}: { reset: boolean; endpoint: string; iot: IoTClient; ssm: SSMClient },
): Promise<void> => {
	const effectiveEndpoint =
		endpoint === undefined ? defaultApiEndpoint : new URL(endpoint)

	const accountInfo = await getAccountInfo({
		endpoint: effectiveEndpoint,
		apiKey,
	})
	const iotEndpoint = await getIoTEndpoint({ iot })()

	console.log(chalk.blue('AWS IoT endpoint:'), chalk.blue(iotEndpoint))
	console.log()

	console.log(chalk.white('nRF Cloud account info:'))
	Object.entries(accountInfo).forEach(([k, v]) =>
		console.log(chalk.yellow(`${k}:`), chalk.blue(v)),
	)
	console.log()

	let settings: Settings | undefined = undefined

	try {
		settings = await getSettings({ ssm, stackName: STACK_NAME })()
		console.log(chalk.white('Stack settings'))
		Object.entries(settings).forEach(([k, v]) =>
			console.log(chalk.yellow(`${k}:`), chalk.blue(v)),
		)
		console.log()
	} catch (err) {
		console.log(chalk.magenta(`Stack not configured.`))
	}

	if (reset === true) {
		console.debug(chalk.magenta(`Deleting account device ...`))
		await deleteAccountDevice({ apiKey, endpoint: effectiveEndpoint })
		console.log(chalk.green(`Account device deleted.`))
	}

	if (settings === undefined || reset === true) {
		console.debug(
			chalk.magenta(`Generating new account device credentials ...`),
		)
		const credentials = await createAccountDevice({
			apiKey,
			endpoint: effectiveEndpoint,
		})
		console.log(chalk.green(`Account device created.`))

		console.debug(chalk.magenta('Creating bridge credentials ...'))

		await updateSettings({ ssm, stackName: STACK_NAME })({
			apiEndpoint: slashless(effectiveEndpoint),
			apiKey,
			teamId: accountInfo.tenantId,
			accountDeviceClientCert: credentials.clientCert,
			accountDevicePrivateKey: credentials.privateKey,
			accountDeviceClientId: `account-${accountInfo.tenantId}`,
			mqttEndpoint: accountInfo.mqttEndpoint,
			mqttTopicPrefix: accountInfo.mqttTopicPrefix,
		})
	}
}

const serviceKeyAction = async (
	serviceKey: string,
	{ ssm }: { ssm: SSMClient },
): Promise<void> => {
	await updateSettings({ ssm, stackName: STACK_NAME })({
		serviceKey,
	})
}

export const configureNrfCloudCommand = ({
	ssm,
	iot,
}: {
	iot: IoTClient
	ssm: SSMClient
}): CommandDefinition => ({
	command: 'configure-nrfcloud <key> [value]',
	options: [
		{
			flags: '-r, --reset',
			description: `Regenerate all credentials. This will regenerate your nRF Cloud account device certificates`,
		},
		{
			flags: '-e, --endpoint',
			description: `nRF Cloud API endpoint, defaults to ${defaultApiEndpoint}`,
		},
	],
	action: async (
		key: string,
		value: string | undefined,
		{ reset, endpoint },
	) => {
		const keyValue = value ?? fs.readFileSync(0, 'utf-8')
		if (keyValue === undefined || keyValue.length === 0) {
			throw new Error(`Must provide value either as argument or via stdin!`)
		}

		switch (key) {
			case 'apiKey':
				await apiKeyAction(keyValue, { reset, endpoint, iot, ssm })
				break
			case 'serviceKey':
				await serviceKeyAction(keyValue, { ssm })
				break
			default:
				throw new Error(`<key> must be "apiKey" or "serviceKey"`)
		}
	},
	help: 'Initialize certificates used in MQTT bridge',
})
