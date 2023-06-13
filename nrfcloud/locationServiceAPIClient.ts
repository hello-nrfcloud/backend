import { Type, type Static, type TSchema } from '@sinclair/typebox'
import { TypeCompiler } from '@sinclair/typebox/compiler'
import type { ValueError } from '@sinclair/typebox/errors/errors.js'
import { slashless } from '../util/slashless.js'
import { createToken } from './createToken.js'

const GroundFixResponseSchema = Type.Object({
	lat: Type.Number(),
	lon: Type.Number(),
	uncertainty: Type.Number(),
})

type GroundFixMessage = {
	'@context': string
	ts: number
	lat: number
	lng: number
	acc: number
}

const validator = <T extends TSchema>(
	schema: T,
	input: unknown,
):
	| {
			value: Static<T>
	  }
	| { errors: ValueError[] } => {
	const C = TypeCompiler.Compile(schema)
	const valid = C.Check(input)
	return valid
		? {
				value: input as Static<T>,
		  }
		: {
				errors: [...C.Errors(input)],
		  }
}

export const locationServiceAPIClient = ({
	endpoint,
	serviceKey,
	teamId,
}: {
	endpoint: URL
	serviceKey: string
	teamId: string
}): {
	groundFix: (
		payload: Record<string, unknown>,
		ts: number,
	) => Promise<GroundFixMessage>
} => {
	const normalizedEndpoint = slashless(endpoint)

	return {
		groundFix: async (payload, ts) => {
			const headers = {
				Authorization: `Bearer ${createToken(teamId, serviceKey)}`,
			}
			const res = await fetch(`${normalizedEndpoint}/v1/location/ground-fix`, {
				method: 'POST',
				headers,
				body: JSON.stringify(payload),
			})

			if (res.ok === false)
				throw new Error(
					`Ground fix API failed with ${res.status}: ${res.statusText}`,
				)

			const result = await res.json()
			const valid = validator(GroundFixResponseSchema, result)
			if ('errors' in valid) {
				throw new Error('Invalid ground fix response')
			}

			return {
				'@context':
					'https://github.com/bifravst/Muninn-backend/device-location',
				ts,
				lat: valid.value.lat,
				lng: valid.value.lon,
				acc: valid.value.uncertainty,
			}
		},
	}
}
