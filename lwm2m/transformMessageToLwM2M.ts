import jsonata from 'jsonata'
import {
	senMLtoLwM2M,
	type LwM2MObjectInstance,
	type Transformer,
} from '@hello.nrfcloud.com/proto-lwm2m'

export type MessageTransformer = (
	message: Record<string, unknown>,
) => Promise<ReturnType<typeof senMLtoLwM2M>>

/**
 * Very simple implementation of a converter.
 */
export const transformMessageToLwM2M = (
	transformers: Readonly<Array<Transformer>>,
): MessageTransformer => {
	// Turn the JSONata in the transformers into executable functions
	const transformerFns = transformers.map(({ match, transform }) => ({
		match: jsonata(match),
		transform: jsonata(transform),
	}))

	return async (
		input: Record<string, unknown>,
	): Promise<Array<LwM2MObjectInstance>> =>
		Promise.all(
			transformerFns.map(async ({ match, transform }) => {
				// Check if the `matched` JSONata returns `true`.
				const matched = await match.evaluate(input)
				if (typeof matched !== 'boolean' || matched !== true) return null
				// Apply the transform
				return transform.evaluate(input)
			}),
		)
			.then((result) => result.flat())
			// Ignore unmatched transformers
			.then((result) => result.filter((item) => item !== null))
			// Convert it to LwM2M
			.then(senMLtoLwM2M)
}
