import type { SSMClient } from '@aws-sdk/client-ssm'
import { getAPISettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import type { CommandDefinition } from './CommandDefinition.js'
import { bulkOpsRequests } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import chalk from 'chalk'

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

		const maybeRequest = await bulkOpsRequests({
			endpoint: apiEndpoint,
			apiKey,
		})(bulkOpsId)

		if ('error' in maybeRequest) {
			console.error(maybeRequest.error)
			process.exit(1)
		}

		const { result: request } = maybeRequest

		console.log(
			chalk.blue(request.bulkOpsRequestId),
			chalk.blueBright(request.status),
		)
		console.log(JSON.stringify(request, null, 2))
	},
	help: 'Check the status of a bulk operation',
})
