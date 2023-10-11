import { MetricUnits } from '@aws-lambda-powertools/metrics'
import type { AddMetricsFn } from './metrics/metrics'
import type { Logger } from '@aws-lambda-powertools/logger'
import type { ErrorObject } from 'ajv'
import type { Static, TObject } from '@sinclair/typebox'
import { validateWithTypeBox } from '@hello.nrfcloud.com/proto'

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

export const loggingFetch =
	({ track, log }: { track: AddMetricsFn; log: Logger }) =>
	async (url: URL, init?: RequestInit): ReturnType<typeof fetch> => {
		log.debug(`fetch:url`, url.toString())
		if (init?.body !== null && init?.body !== undefined)
			log.debug(`fetch:body`, init.body.toString())

		const start = Date.now()

		const res = await fetch(url, init)

		const responseTime = Date.now() - start
		track('apiResponseTime', MetricUnits.Milliseconds, responseTime)

		log.debug('fetch:responseTime', responseTime.toString())
		log.debug('fetch:status', res.status.toString())

		return res
	}

export const validatedLoggingFetch = (
	...args: Parameters<typeof loggingFetch>
): (<Schema extends TObject>(
	url: URL,
	init: RequestInit,
	schema: Schema,
) => Promise<
	{ error: Error | ValidationError } | { result: Static<Schema> }
>) => {
	const lf = loggingFetch(...args)
	return async (url, init = {}, schema) => {
		try {
			const response = await lf(url, init)
			if (!response.ok)
				throw new Error(`Error fetching status: ${response.status}`)

			return { result: validate(schema, await response.json()) }
		} catch (error: unknown) {
			if (error instanceof ValidationError) {
				return { error }
			} else {
				return { error: error as Error }
			}
		}
	}
}
