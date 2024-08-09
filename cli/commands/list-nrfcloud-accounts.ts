import type { SSMClient } from '@aws-sdk/client-ssm'
import { getAllAccounts } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import chalk from 'chalk'
import { table } from 'table'
import type { CommandDefinition } from './CommandDefinition.js'

export const listnRFCloudAccountsCommand = ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): CommandDefinition => ({
	command: 'list-nrfcloud-accounts',
	action: async () => {
		const accounts = await getAllAccounts({
			ssm,
			stackName,
		})

		const accountRows = accounts.map((account) => [chalk.green(account)])
		console.log(table([['nRF Cloud Account'], ...accountRows]))
	},
	help: 'List configured nRF Cloud accounts',
})
