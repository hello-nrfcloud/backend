import { Type } from '@sinclair/typebox'
import { validatedFetch } from './validatedFetch.js'

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
	const vf = validatedFetch({ endpoint, apiKey })
	const maybeResult = await vf(
		{ resource: 'devices/account' },
		Type.Object({
			clientCert: Type.String(),
			privateKey: Type.String(),
		}),
		{
			method: 'POST',
		},
	)

	if ('error' in maybeResult) {
		console.error(`Failed to create account device:`, maybeResult.error)
		throw new Error(`Failed to create account device`)
	}

	return {
		clientCert: maybeResult.result.clientCert,
		privateKey: maybeResult.result.privateKey,
	}
}
