import { type UsageSummary } from './calculateCosts.js'
import { getAPISettings } from './settings.js'
import { apiClient } from './apiClient.js'
import type { SSMClient } from '@aws-sdk/client-ssm'

export const getCostSummaryFromAPI = async (
	account: string,
	stackName: string,
	ssm: SSMClient,
): Promise<UsageSummary> => {
	const { apiKey, apiEndpoint } = await getAPISettings({
		ssm,
		stackName,
		account,
	})()

	const client = apiClient({
		endpoint: apiEndpoint,
		apiKey,
	})
	const summary = await client.accountSummary(account)

	if ('error' in summary) {
		console.error(summary.error)
		process.exit(1)
	}
	return summary.summary
}
