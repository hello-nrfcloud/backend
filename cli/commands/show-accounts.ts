import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { table } from 'table'
import type { CommandDefinition } from './CommandDefinition.js'
import { getAllnRFCloudAccounts } from '../../nrfcloud/allAccounts.js'

export const showAccountsCommand = ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): CommandDefinition => ({
	command: 'show-accounts',
	action: async () => {
		const accounts = await getAllnRFCloudAccounts({
			ssm,
			stackName,
		})

		const accountRows = accounts.map((account) => [chalk.green(account)])
		console.log(table([['nRF Cloud Account'], ...accountRows]))
	},
	help: 'Show nRF Cloud accounts',
})
