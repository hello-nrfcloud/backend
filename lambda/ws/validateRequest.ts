import { ProblemDetail } from '@hello.nrfcloud.com/proto/hello'
import { type Static, type TSchema } from '@sinclair/typebox'
import type { ValueError } from '@sinclair/typebox/compiler'
import { toBadRequest } from './toBadRequest.js'

/**
 * Validates a request using a validator
 */
export const validateRequest = <Schema extends TSchema>(
	payload: Record<string, any>,
	validator: (payload: Record<string, any>) =>
		| { value: Static<Schema> }
		| {
				errors: ValueError[]
		  },
):
	| {
			problem: Static<typeof ProblemDetail>
	  }
	| { request: Static<Schema> } => {
	const maybeValidRequest = validator(payload)
	if ('errors' in maybeValidRequest) {
		return { problem: toBadRequest(payload, maybeValidRequest.errors) }
	}
	return { request: maybeValidRequest.value }
}
