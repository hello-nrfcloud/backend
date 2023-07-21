import { IoTClient } from '@aws-sdk/client-iot'
import { SSMClient } from '@aws-sdk/client-ssm'
import { initializeAccount } from '../../nrfcloud/initializeAccount.js'
import type { CommandDefinition } from './CommandDefinition.js'
import {
	validnRFCloudAccount,
	convertTonRFAccount,
	availableAccounts,
} from '../validnRFCloudAccount.js'
import chalk from 'chalk'

export const initializeNRFCloudAccountCommand = ({
	ssm,
	iot,
	stackName,
}: {
	iot: IoTClient
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
		const scope = convertTonRFAccount(account)
		if (!validnRFCloudAccount(scope)) {
			console.error(
				chalk.red('⚠️'),
				'',
				chalk.red(`account should be ${availableAccounts.join(', ')}`),
			)
			process.exit(1)
		}

		await initializeAccount({ iot, ssm, stackName, scope })(reset)
	},
	help: 'Initialize certificates used in MQTT bridge',
})
