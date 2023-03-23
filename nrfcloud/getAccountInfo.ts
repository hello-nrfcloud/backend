import { slashless } from '../util/slashless'

export type AccountInfo = {
	mqttEndpoint: string
	mqttTopicPrefix: string
	tenantId: string
}

export const getAccountInfo = async ({
	apiKey,
	endpoint,
}: {
	apiKey: string
	endpoint: URL
}): Promise<AccountInfo> => {
	const accountInfo = await (
		await fetch(`${slashless(endpoint)}/v1/account`, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		})
	).json()
	return {
		mqttEndpoint: accountInfo.mqttEndpoint,
		mqttTopicPrefix: accountInfo.mqttTopicPrefix,
		tenantId: accountInfo.team.tenantId,
	}
}
