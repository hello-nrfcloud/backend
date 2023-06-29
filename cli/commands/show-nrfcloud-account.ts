import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { table } from 'table'
import { apiClient } from '../../nrfcloud/apiClient.js'
import { getAPISettings } from '../../nrfcloud/settings.js'
import type { CommandDefinition } from './CommandDefinition.js'

export const showNRFCloudAccount = ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): CommandDefinition => ({
	command: 'show-nrfcloud-account',
	action: async () => {
		const { apiKey, apiEndpoint } = await getAPISettings({
			ssm,
			stackName,
		})()

		const client = apiClient({
			endpoint: apiEndpoint,
			apiKey,
		})

		const account = await client.account()
		if ('error' in account) {
			console.error(chalk.red('⚠️'), '', chalk.red(account.error.message))
			process.exit(1)
		}

		console.log(
			table([
				['Team name', 'Tenant ID', 'API endpoint', 'API key'],
				[
					chalk.cyan(account.account.team.name),
					chalk.cyan(account.account.team.tenantId),
					chalk.magenta(apiEndpoint.toString()),
					chalk.magenta(`${apiKey.slice(0, 5)}***`),
				],
			]),
		)
	},
	help: 'Show information about the associated nRF Cloud account',
})
