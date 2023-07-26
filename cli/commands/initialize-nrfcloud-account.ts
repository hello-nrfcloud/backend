import { IoTClient } from '@aws-sdk/client-iot'
import { SSMClient } from '@aws-sdk/client-ssm'
import { initializeAccount } from '../../nrfcloud/initializeAccount.js'
import type { CommandDefinition } from './CommandDefinition.js'

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
		await initializeAccount({ iot, ssm, stackName, account })(reset)
	},
	help: 'Initialize certificates used in MQTT bridge',
})
