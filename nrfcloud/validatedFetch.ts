import { type Static, type TObject } from '@sinclair/typebox'
import { slashless } from '../util/slashless.js'
import { validateWithTypeBox } from '@hello.nrfcloud.com/proto'
import type { ErrorObject } from 'ajv'

export class ValidationError extends Error {
	public errors: ErrorObject[]
	public readonly isValidationError = true
	constructor(errors: ErrorObject[]) {
		super(`Validation errors`)
		this.name = 'ValidationError'
		this.errors = errors
	}
}

const validate = <T extends TObject>(
	SchemaObject: T,
	data: unknown,
): Static<T> => {
	const maybeData = validateWithTypeBox(SchemaObject)(data)

	if ('errors' in maybeData) {
		throw new ValidationError(maybeData.errors)
	}

	return maybeData.value
}

const fetchData =
	(fetchImplementation?: typeof fetch) =>
	async (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => {
		const response = await (fetchImplementation ?? fetch)(...args)
		if (!response.ok)
			throw new Error(
				`Error fetching status: ${response.status} - ${response.statusText}`,
			)

		return response.json()
	}

export const validatedFetch =
	(
		{ endpoint, apiKey }: { apiKey: string; endpoint: URL },
		fetchImplementation?: typeof fetch,
	) =>
	async <Schema extends TObject>(
		{ resource }: { resource: string },
		schema: Schema,
		init?: RequestInit,
	): Promise<{ error: Error | ValidationError } | { result: Static<Schema> }> =>
		fetchData(fetchImplementation)(`${slashless(endpoint)}/v1/${resource}`, {
			headers: {
				...headers(apiKey),
				'Content-Type': 'application/json',
			},
			...(init ?? {}),
		})
			.then((res) => ({ result: validate(schema, res) }))
			.catch((error: Error): { error: Error | ValidationError } => ({
				error,
			}))

const headers = (apiKey: string) => ({
	Authorization: `Bearer ${apiKey}`,
	Accept: 'application/json; charset=utf-8',
})
