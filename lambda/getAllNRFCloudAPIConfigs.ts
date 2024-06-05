import type { SSMClient } from '@aws-sdk/client-ssm'
import { getAllAccountsSettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import { once } from 'lodash-es'

export const getAllNRFCloudAPIConfigs = ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): (() => Promise<
	Record<
		string,
		{
			apiKey: string
			apiEndpoint: URL
		}
	>
>) =>
	once(async () => {
		const allAccountsSettings = await getAllAccountsSettings({
			ssm,
			stackName,
		})
		return Object.entries(allAccountsSettings).reduce(
			(result, [account, settings]) => ({
				...result,
				[account]: {
					apiKey: settings.apiKey,
					apiEndpoint: new URL(
						settings.apiEndpoint ?? 'https://api.nrfcloud.com/',
					),
				},
			}),
			{},
		)
	})
