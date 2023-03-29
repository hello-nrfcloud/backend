import { IoTClient } from '@aws-sdk/client-iot'
import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { getIoTEndpoint } from '../../aws/getIoTEndpoint'
import { STACK_NAME } from '../../cdk/stacks/stackConfig'
import { createAccountDevice } from '../../nrfcloud/createAccountDevice'
import { deleteAccountDevice } from '../../nrfcloud/deleteNrfcloudCredentials'
import { getAccountInfo } from '../../nrfcloud/getAccountInfo'
import {
	getSettings,
	updateSettings,
	type Settings,
} from '../../nrfcloud/settings.js'
import { slashless } from '../../util/slashless'
import type { CommandDefinition } from './CommandDefinition'

const defaultApiEndpoint = new URL('https://api.nrfcloud.com')

export const configureNrfCloudCommand = ({
	ssm,
	iot,
}: {
	iot: IoTClient
	ssm: SSMClient
}): CommandDefinition => ({
	command: 'configure-nrfcloud <apiKey>',
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
	action: async (apiKey: string, { reset, endpoint }) => {
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
				apiKey: apiKey,
				accountDeviceClientCert: credentials.clientCert,
				accountDevicePrivateKey: credentials.privateKey,
				accountDeviceClientId: `account-${accountInfo.tenantId}`,
				mqttEndpoint: accountInfo.mqttEndpoint,
				mqttTopicPrefix: accountInfo.mqttTopicPrefix,
			})
		}
	},
	help: 'Initialize certificates used in MQTT bridge',
})
