import { type Static, type TObject } from '@sinclair/typebox'
import { slashless } from '../util/slashless.js'
import { ValidationError, fetchData, validate, onError } from './apiClient.js'

export const validatedFetch =
	(
		{ endpoint, apiKey }: { apiKey: string; endpoint: URL },
		fetchImplementation?: typeof fetch,
	) =>
	async <Schema extends TObject>(
		{ resource }: { resource: string },
		schema: Schema,
	): Promise<{ error: Error | ValidationError } | { result: Static<Schema> }> =>
		fetchData(fetchImplementation)(`${slashless(endpoint)}/v1/${resource}`, {
			headers: {
				...headers(apiKey),
				'Content-Type': 'application/json',
			},
		})
			.then((res) => ({ result: validate(schema, res) }))
			.catch(onError)

const headers = (apiKey: string) => ({
	Authorization: `Bearer ${apiKey}`,
	Accept: 'application/json; charset=utf-8',
})
