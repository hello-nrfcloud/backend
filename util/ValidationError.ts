import type { ValueError } from '@sinclair/typebox/errors'

export class ValidationError extends Error {
	public readonly errors: ValueError[]
	constructor(errors: ValueError[]) {
		super('Validation error')
		this.errors = errors
	}
}
