import type { SSMClient } from '@aws-sdk/client-ssm'
import { apiClient } from '../../nrfcloud/apiClient.js'
import { getAPISettings } from '../../nrfcloud/settings.js'
import type { CommandDefinition } from './CommandDefinition.js'

export const getNRFCloudBulkOpsStatus = ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): CommandDefinition => ({
	command: 'get-nrfcloud-bulkops-status <account> <bulkOpsId>',
	action: async (account, bulkOpsId) => {
		const { apiKey, apiEndpoint } = await getAPISettings({
			ssm,
			stackName,
			account,
		})()

		const client = apiClient({
			endpoint: apiEndpoint,
			apiKey,
		})

		const status = await client.getBulkOpsStatus(bulkOpsId)

		if ('error' in status) {
			console.error(status.error)
			process.exit(1)
		}

		console.log(status.status)
	},
	help: 'Check the status of a bulk operation',
})
