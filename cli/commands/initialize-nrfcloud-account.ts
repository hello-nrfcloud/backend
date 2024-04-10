import { SSMClient } from '@aws-sdk/client-ssm'
import type { CommandDefinition } from './CommandDefinition.js'
import chalk from 'chalk'
import {
	NRFCLOUD_ACCOUNT_SCOPE,
	nrfCloudAccount,
	defaultApiEndpoint,
	getSettings as getNRFCloudSettings,
	putSettings as putNRFCloudSettings,
	type Settings,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import { get } from '@bifravst/aws-ssm-settings-helpers'
import {
	createAccountDevice,
	deleteAccountDevice,
	getAccountInfo,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'

export const initializeNRFCloudAccountCommand = ({
	ssm,
	iotEndpoint,
	stackName,
}: {
	iotEndpoint: string
	ssm: SSMClient
	stackName: string
}): CommandDefinition => ({
	command: 'initialize-nrfcloud-account <account>',
	options: [
		{
			flags: '-r, --reset',
			description: `Regenerate all credentials. This will regenerate your nRF Cloud account device certificates`,
		},
	],
	action: async (account, { reset }) => {
		await initializeAccount({
			iotEndpoint,
			ssm,
			stackName,
			account,
		})(reset)
	},
	help: 'Initialize certificates used in MQTT bridge',
})

const initializeAccount =
	({
		ssm,
		stackName,
		account,
		iotEndpoint,
	}: {
		ssm: SSMClient
		stackName: string
		account: string
		iotEndpoint: string
	}) =>
	async (reset = false): Promise<void> => {
		const settingsReader = get(ssm)({
			stackName,
			scope: NRFCLOUD_ACCOUNT_SCOPE,
			context: nrfCloudAccount(account),
		})

		const { apiKey, apiEndpoint } = await settingsReader()
		if (apiKey === undefined)
			throw new Error(`nRF Cloud API key not configured.`)

		let settingsWithAccountDevice: Settings | undefined = undefined
		try {
			settingsWithAccountDevice = await getNRFCloudSettings({
				ssm,
				stackName,
				account,
			})()
			console.log(chalk.white('Stack settings'))
			Object.entries(settingsWithAccountDevice).forEach(([k, v]) =>
				console.log(chalk.yellow(`${k}:`), chalk.blue(v)),
			)
			console.log()
		} catch (err) {
			console.log(chalk.magenta(`Stack not configured.`))
		}

		const effectiveEndpoint =
			apiEndpoint === undefined ? defaultApiEndpoint : new URL(apiEndpoint)

		const accountInfo = await getAccountInfo({
			endpoint: effectiveEndpoint,
			apiKey,
		})
		if ('error' in accountInfo) {
			console.error(chalk.red('⚠️'), '', chalk.red(accountInfo.error.message))
			process.exit(1)
		}

		console.log(chalk.yellow('AWS IoT endpoint:'), chalk.blue(iotEndpoint))
		console.log()

		console.log(chalk.white('nRF Cloud account info:'))
		Object.entries(accountInfo).forEach(([k, v]) =>
			console.log(chalk.yellow(`${k}:`), chalk.blue(v)),
		)
		console.log()

		if (reset === true) {
			console.debug(chalk.magenta(`Deleting account device ...`))
			await deleteAccountDevice({ apiKey, endpoint: effectiveEndpoint })
			console.log(chalk.green(`Account device deleted.`))
		}

		if (settingsWithAccountDevice === undefined || reset === true) {
			console.debug(
				chalk.magenta(`Generating new account device credentials ...`),
			)
			const { clientCert, privateKey } = await createAccountDevice({
				apiKey,
				endpoint: effectiveEndpoint,
			})
			if (privateKey === undefined) {
				console.error(chalk.red('⚠️'), chalk.red('Account device exists'))
				throw new Error(
					`Account device exists in account ${accountInfo.team.tenantId}`,
				)
			}
			console.log(chalk.green(`Account device created.`))

			await putNRFCloudSettings({ ssm, stackName, account })({
				accountDeviceClientCert: clientCert,
				accountDevicePrivateKey: privateKey,
				accountDeviceClientId: `account-${accountInfo.team.tenantId}`,
				mqttEndpoint: accountInfo.mqttEndpoint,
				mqttTopicPrefix: accountInfo.mqttTopicPrefix,
			})
		}
	}
