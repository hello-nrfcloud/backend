import { getAPISettings } from './settings.js'
import { devices } from './devices.js'
import type { SSMClient } from '@aws-sdk/client-ssm'

const clients: Record<string, Promise<ReturnType<typeof devices>>> = {}

/**
 * Returns a nRF Cloud API client for the given account
 */
export const accountApiClient = async (
	account: string,
	stackName: string,
	ssm: SSMClient,
): Promise<ReturnType<typeof devices>> => {
	const client =
		clients[account] ??
		getAPISettings({
			ssm,
			stackName,
			account,
		})().then(({ apiKey, apiEndpoint }) =>
			devices({
				endpoint: apiEndpoint,
				apiKey,
			}),
		)
	clients[account] = client
	return client
}
