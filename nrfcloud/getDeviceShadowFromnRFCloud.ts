import { Type, type Static } from '@sinclair/typebox'
import { logger } from '../lambda/util/logger.js'
import { validatedFetch } from './validatedFetch.js'
import { DeviceShadow } from './DeviceShadow.js'

const DeviceShadows = Type.Array(DeviceShadow)

/**
 * @see https://api.nrfcloud.com/v1#tag/All-Devices/operation/ListDevices
 */
const ListDevices = Type.Object({
	items: DeviceShadows,
	total: Type.Optional(Type.Number({ minimum: 0 })),
	pageNextToken: Type.Optional(Type.String({ minLength: 1 })),
})

const log = logger('deviceShadowFetcher')

export const deviceShadowFetcher = ({
	endpoint,
	apiKey,
	onError,
}: {
	endpoint: URL
	apiKey: string
	onError?: (error: Error) => void
}): ((devices: string[]) => Promise<Static<typeof DeviceShadows>>) => {
	const vf = validatedFetch({ endpoint, apiKey })

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

		log.info(`Fetching device shadow`, { url })
		const maybeResult = await vf({ resource: url }, ListDevices)
		if ('error' in maybeResult) {
			onError?.(maybeResult.error)
			log.error(`Fetching shadow error`, { error: maybeResult.error })
			return []
		}

		return maybeResult.result.items
	}
}
