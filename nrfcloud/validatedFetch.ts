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
		console.error('Validation failed', { error: maybeData.errors })
		throw new ValidationError(maybeData.errors)
	}

	return maybeData.value
}

const fetchData =
	(fetchImplementation?: typeof fetch) =>
	async (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => {
		const response = await (fetchImplementation ?? fetch)(...args)
		if (!response.ok)
			throw new Error(`Error fetching status: ${response.status}`)

		return response.json()
	}

export const validatedFetch =
	(
		{ endpoint, apiKey }: { apiKey: string; endpoint: URL },
		fetchImplementation?: typeof fetch,
	) =>
	async <Schema extends TObject>(
		params:
			| {
					resource: string
			  }
			| {
					resource: string
					payload: Payload
			  }
			| {
					resource: string
					method: string
			  },
		schema: Schema,
	): Promise<
		{ error: Error | ValidationError } | { result: Static<Schema> }
	> => {
		const { resource } = params
		const args: Parameters<typeof fetch>[1] = {
			headers: headers(apiKey),
		}
		if ('payload' in params) {
			const payload = params.payload
			args.method = 'POST'
			args.body = payload.body
			args.headers = { ...(args.headers ?? {}), ['Content-Type']: payload.type }
		} else if ('method' in params) {
			args.method = params.method
		}
		return fetchData(fetchImplementation)(
			`${slashless(endpoint)}/v1/${resource}`,
			args,
		)
			.then((res) => ({ result: validate(schema, res) }))
			.catch((error: Error): { error: Error | ValidationError } => ({
				error,
			}))
	}

const headers = (apiKey: string) => ({
	Authorization: `Bearer ${apiKey}`,
	Accept: 'application/json; charset=utf-8',
})

type Payload = {
	/** The content-type of body */
	type: string
	body: string
}
export const JSONPayload = (payload: Record<string, unknown>): Payload => ({
	type: 'application/json',
	body: JSON.stringify(payload),
})
