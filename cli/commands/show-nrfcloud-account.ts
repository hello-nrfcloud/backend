import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { table } from 'table'
import { apiClient } from '../../nrfcloud/apiClient.js'
import { getAPISettings } from '../../nrfcloud/settings.js'
import type { CommandDefinition } from './CommandDefinition.js'
import {
	convertTonRFAccount,
	validnRFCloudAccount,
} from '../validnRFCloudAccount.js'

export const showNRFCloudAccount = ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): CommandDefinition => ({
	command: 'show-nrfcloud-account <account>',
	action: async (account) => {
		const scope = convertTonRFAccount(account)
		if (!validnRFCloudAccount(scope)) {
			console.error(chalk.red('⚠️'), '', chalk.red(`account is invalid`))
			process.exit(1)
		}

		const { apiKey, apiEndpoint } = await getAPISettings({
			ssm,
			stackName,
			scope,
		})()

		const client = apiClient({
			endpoint: apiEndpoint,
			apiKey,
		})

		const accountNRF = await client.account()
		if ('error' in accountNRF) {
			console.error(chalk.red('⚠️'), '', chalk.red(accountNRF.error.message))
			process.exit(1)
		}

		console.log(
			table([
				['Team name', 'Tenant ID', 'API endpoint', 'API key'],
				[
					chalk.cyan(accountNRF.account.team.name),
					chalk.cyan(accountNRF.account.team.tenantId),
					chalk.magenta(apiEndpoint.toString()),
					chalk.magenta(`${apiKey.slice(0, 5)}***`),
				],
			]),
		)
	},
	help: 'Show information about the associated nRF Cloud account',
})
