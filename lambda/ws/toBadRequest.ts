import { BadRequestError, ProblemDetail } from '@hello.nrfcloud.com/proto/hello'
import { type Static } from '@sinclair/typebox'
import type { ErrorObject } from 'ajv'

/**
 * Converts validation errors to ProblemDetail
 */
export const toBadRequest = (
	payload: { '@id'?: string },
	errors: ErrorObject<string, unknown>[],
): Static<typeof ProblemDetail> =>
	BadRequestError({
		id: payload?.['@id'],
		title: 'Invalid request',
		detail: JSON.stringify(errors),
	})
