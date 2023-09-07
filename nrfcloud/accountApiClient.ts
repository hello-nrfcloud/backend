import { getAPISettings } from './settings.js'
import { apiClient } from './apiClient.js'
import type { SSMClient } from '@aws-sdk/client-ssm'

const clients: Record<string, Promise<ReturnType<typeof apiClient>>> = {}

/**
 * Returns a nRF Cloud API client for the given account
 */
export const accountApiClient = async (
	account: string,
	stackName: string,
	ssm: SSMClient,
): Promise<ReturnType<typeof apiClient>> => {
	const client =
		clients[account] ??
		getAPISettings({
			ssm,
			stackName,
			account,
		})().then(({ apiKey, apiEndpoint }) =>
			apiClient({
				endpoint: apiEndpoint,
				apiKey,
			}),
		)
	clients[account] = client
	return client
}
