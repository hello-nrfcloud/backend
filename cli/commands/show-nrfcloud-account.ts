import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { table } from 'table'
import { getAPISettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import type { CommandDefinition } from './CommandDefinition.js'
import { getAccountInfo } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'

export const showNRFCloudAccount = ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): CommandDefinition => ({
	command: 'show-nrfcloud-account <account>',
	action: async (account) => {
		const { apiKey, apiEndpoint } = await getAPISettings({
			ssm,
			stackName,
			account,
		})()

		const accountNRF = await getAccountInfo({
			endpoint: apiEndpoint,
			apiKey,
		})
		if ('error' in accountNRF) {
			console.error(chalk.red('⚠️'), '', chalk.red(accountNRF.error.message))
			process.exit(1)
		}

		console.log(
			table([
				['Team name', 'Tenant ID', 'API endpoint', 'API key'],
				[
					chalk.cyan(accountNRF.team.name),
					chalk.cyan(accountNRF.team.tenantId),
					chalk.magenta(apiEndpoint.toString()),
					chalk.magenta(`${apiKey.slice(0, 5)}***`),
				],
			]),
		)
	},
	help: 'Show information about the associated nRF Cloud account',
})
