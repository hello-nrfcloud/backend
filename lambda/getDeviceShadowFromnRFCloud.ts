import { logger } from './logger.js'

export type DeviceShadow = {
	id: string
	state: {
		reported: Record<string, any>
		version: number
		metadata: Record<string, any>
	}
}

const log = logger('deviceShadowFetcher')

export const deviceShadowFetcher =
	({ endpoint, apiKey }: { endpoint: string; apiKey: string }) =>
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
		const url = `${endpoint.replace(/\/$/, '')}/v1/devices?${queryString}`

		log.info(`Fetching device shadow`, { url })
		// Change to bulk fetching device shadow otherwise it might hit rate limit
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
			const error = await res.json()
			throw new Error(`${error.code}: ${error.message}`)
		}
	}
