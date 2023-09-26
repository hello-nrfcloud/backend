import { logger } from '../lambda/util/logger.js'
import { slashless } from '../util/slashless.js'
import { type DeviceShadow } from './DeviceShadow.js'

const log = logger('deviceShadowFetcher')

export const deviceShadowFetcher =
	({
		endpoint,
		apiKey,
		onError,
	}: {
		endpoint: URL
		apiKey: string
		onError?: (res: Response) => void
	}) =>
	async (devices: string[]): Promise<DeviceShadow[]> => {
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
		const url = `${slashless(endpoint)}/v1/devices?${queryString}`

		log.info(`Fetching device shadow`, { url })
		// Change to bulk fetching device shadow otherwise it might hit rate limit
		// FIXME: validate response
		const res = await fetch(url, {
			method: 'get',
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		})

		if (res.ok) {
			const data = await res.json()
			return data.items as DeviceShadow[]
		} else {
			onError?.(res)
			log.error(`Fetching shadow error`, {
				status: res.status,
				statusText: res.statusText,
			})
			return []
		}
	}
