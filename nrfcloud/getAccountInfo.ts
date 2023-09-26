import { Type, type Static } from '@sinclair/typebox'
import { validatedFetch } from './validatedFetch.js'
import type { ValidationError } from 'ajv'

const AccountInfoType = Type.Object({
	mqttEndpoint: Type.String(), // e.g. 'mqtt.nrfcloud.com'
	mqttTopicPrefix: Type.String(), // e.g. 'prod/a0673464-e4e1-4b87-bffd-6941a012067b/',
	team: Type.Object({
		tenantId: Type.String(), // e.g. 'bbfe6b73-a46a-43ad-94bd-8e4b4a7847ce',
		name: Type.String(), // e.g. 'hello.nrfcloud.com'
	}),
})
export type AccountInfo = Static<typeof AccountInfoType>

export const getAccountInfo = async (
	{
		apiKey,
		endpoint,
	}: {
		apiKey: string
		endpoint: URL
	},
	fetchImplementation?: typeof fetch,
): Promise<{ error: Error | ValidationError } | AccountInfo> => {
	const maybeAccount = await validatedFetch(
		{
			endpoint,
			apiKey,
		},
		fetchImplementation,
	)(
		{
			resource: 'account',
		},
		AccountInfoType,
	)

	if ('error' in maybeAccount) return maybeAccount
	return maybeAccount.result
}
