import { slashless } from '../util/slashless.js'

export type CertificateCredentials = {
	clientCert: string
	privateKey: string
}

export const createAccountDevice = async ({
	apiKey,
	endpoint,
}: {
	apiKey: string
	endpoint: URL
}): Promise<CertificateCredentials> => {
	const accountDevice = await // FIXME: validate response
	(
		await fetch(`${slashless(endpoint)}/v1/devices/account`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		})
	).json()

	return {
		clientCert: accountDevice.clientCert,
		privateKey: accountDevice.privateKey,
	}
}
