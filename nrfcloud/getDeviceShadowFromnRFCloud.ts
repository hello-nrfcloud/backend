import { Type, type Static } from '@sinclair/typebox'
import { validatedFetch } from './validatedFetch.js'
import { DeviceShadow } from './DeviceShadow.js'
import type { ValidationError } from 'ajv'

const DeviceShadows = Type.Array(DeviceShadow)

/**
 * @see https://api.nrfcloud.com/v1#tag/All-Devices/operation/ListDevices
 */
const ListDevices = Type.Object({
	items: DeviceShadows,
	total: Type.Optional(Type.Number({ minimum: 0 })),
	pageNextToken: Type.Optional(Type.String({ minLength: 1 })),
})

export const deviceShadowFetcher = (
	{
		endpoint,
		apiKey,
	}: {
		endpoint: URL
		apiKey: string
	},
	fetchImplementation?: typeof fetch,
): ((
	devices: string[],
) => Promise<
	{ shadows: Static<typeof DeviceShadows> } | { error: Error | ValidationError }
>) => {
	const vf = validatedFetch({ endpoint, apiKey }, fetchImplementation)

	return async (devices) => {
		const params = {
			includeState: true,
			includeStateMeta: true,
			pageLimit: 100,
			deviceIds: devices.join(','),
		}
		const queryString = Object.entries(params)
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map((kv) => kv.map(encodeURIComponent).join('='))
			.join('&')
		const url = `devices?${queryString}`

		const maybeResult = await vf({ resource: url }, ListDevices)
		if ('error' in maybeResult) {
			return { error: maybeResult.error }
		}

		return { shadows: maybeResult.result.items }
	}
}
