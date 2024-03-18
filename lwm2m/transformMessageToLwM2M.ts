import jsonata from 'jsonata'
import {
	senMLtoLwM2M,
	type LwM2MObjectInstance,
	type Transform,
} from '@hello.nrfcloud.com/proto-map'

export type MessageTransform = (
	message: Record<string, unknown>,
) => Promise<ReturnType<typeof senMLtoLwM2M>>

/**
 * Very simple implementation of a converter.
 */
export const transformMessageToLwM2M = (
	transforms: Readonly<Array<Transform>>,
): MessageTransform => {
	// Turn the JSONata in the transforms into executable functions
	const transformFns = transforms.map(({ match, transform }) => ({
		match: jsonata(match),
		transform: jsonata(transform),
	}))

	return async (
		input: Record<string, unknown>,
	): Promise<Array<LwM2MObjectInstance>> =>
		Promise.all(
			transformFns.map(async ({ match, transform }) => {
				// Check if the `matched` JSONata returns `true`.
				const matched = await match.evaluate(input)
				if (typeof matched !== 'boolean' || matched !== true) return null
				// Apply the transform
				return transform.evaluate(input)
			}),
		)
			.then((result) => result.flat())
			// Ignore unmatched transforms
			.then((result) => result.filter((item) => item !== null))
			// Convert it to LwM2M
			.then(senMLtoLwM2M)
}
