import { BadRequestError, ProblemDetail } from '@hello.nrfcloud.com/proto/hello'
import { type Static } from '@sinclair/typebox'
import type { ValueError } from '@sinclair/typebox/compiler'

/**
 * Converts validation errors to ProblemDetail
 */
export const toBadRequest = (
	payload: { '@id'?: string },
	errors: ValueError[],
): Static<typeof ProblemDetail> =>
	BadRequestError({
		id: payload?.['@id'],
		title: 'Invalid request',
		detail: JSON.stringify(errors),
	})
