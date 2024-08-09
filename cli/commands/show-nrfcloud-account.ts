import type { SSMClient } from '@aws-sdk/client-ssm'
import { getAccountInfo } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { getAPISettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import chalk from 'chalk'
import { table } from 'table'
import type { CommandDefinition } from './CommandDefinition.js'

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

		const maybedAccountInfo = await getAccountInfo({
			endpoint: apiEndpoint,
			apiKey,
		})
		if ('error' in maybedAccountInfo) {
			console.error(
				chalk.red('⚠️'),
				'',
				chalk.red(maybedAccountInfo.error.message),
			)
			process.exit(1)
		}

		const accountInfo = maybedAccountInfo.result

		console.log(
			table([
				['Team name', 'Tenant ID', 'API endpoint', 'API key'],
				[
					chalk.cyan(accountInfo.team.name),
					chalk.cyan(accountInfo.team.tenantId),
					chalk.magenta(apiEndpoint.toString()),
					chalk.magenta(`${apiKey.slice(0, 5)}***`),
				],
			]),
		)
	},
	help: 'Show information about the associated nRF Cloud account',
})
