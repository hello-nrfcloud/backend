import { slashless } from '../util/slashless.js'

export const deleteAccountDevice = async ({
	apiKey,
	endpoint,
}: {
	apiKey: string
	endpoint: URL
}): Promise<void> => {
	await fetch(`${slashless(endpoint)}/v1/devices/account`, {
		method: 'DELETE',
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
	})
}
