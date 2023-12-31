import { IoTClient } from '@aws-sdk/client-iot'
import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { getIoTEndpoint } from '../aws/getIoTEndpoint.js'
import { STACK_NAME } from '../cdk/stacks/stackConfig.js'
import { Scope, getSettings } from '../util/settings.js'
import { createAccountDevice } from './createAccountDevice.js'
import { deleteAccountDevice } from './deleteNrfcloudCredentials.js'
import { getAccountInfo } from './getAccountInfo.js'
import {
	defaultApiEndpoint,
	getSettings as getNRFCloudSettings,
	putSettings as putNRFCloudSettings,
	type Settings,
} from './settings.js'

/**
 * Initializes the nRF Cloud Account
 */
export const initializeAccount =
	({
		iot,
		ssm,
		stackName,
		account,
	}: {
		iot: IoTClient
		ssm: SSMClient
		stackName: string
		account: string
	}) =>
	async (reset = false): Promise<void> => {
		const scope = `${Scope.NRFCLOUD_ACCOUNT_PREFIX}/${account}`
		const settingsReader = getSettings({
			ssm,
			stackName,
			scope,
		})

		const { apiKey, apiEndpoint } = await settingsReader()
		if (apiKey === undefined)
			throw new Error(`nRF Cloud API key not configured.`)

		let settingsWithAccountDevice: Settings | undefined = undefined
		try {
			settingsWithAccountDevice = await getNRFCloudSettings({
				ssm,
				stackName: STACK_NAME,
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

		const iotEndpoint = await getIoTEndpoint({ iot })()

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

			await putNRFCloudSettings({ ssm, stackName: STACK_NAME, account })({
				accountDeviceClientCert: clientCert,
				accountDevicePrivateKey: privateKey,
				accountDeviceClientId: `account-${accountInfo.team.tenantId}`,
				mqttEndpoint: accountInfo.mqttEndpoint,
				mqttTopicPrefix: accountInfo.mqttTopicPrefix,
			})
		}
	}
