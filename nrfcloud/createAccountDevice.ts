import { Type, type Static } from '@sinclair/typebox'
import { validatedFetch } from './validatedFetch.js'

/**
 * @link https://api.nrfcloud.com/v1/#tag/Account-Devices/operation/CreateAccountDevice
 */
const CertificateCredentials = Type.Object({
	clientCert: Type.String(),
	privateKey: Type.String(),
})

export const createAccountDevice = async ({
	apiKey,
	endpoint,
}: {
	apiKey: string
	endpoint: URL
}): Promise<Static<typeof CertificateCredentials>> => {
	const vf = validatedFetch({ endpoint, apiKey })
	const maybeResult = await vf(
		{ resource: 'devices/account', method: 'POST' },
		CertificateCredentials,
	)

	if ('error' in maybeResult) {
		throw maybeResult.error
	}

	return {
		clientCert: maybeResult.result.clientCert,
		privateKey: maybeResult.result.privateKey,
	}
}
