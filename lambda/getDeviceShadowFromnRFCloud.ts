import { type Logger } from '@aws-lambda-powertools/logger'

type DeviceShadow = {
	id: string
	state: {
		reported: Record<string, any>
		version: number
	}
}

export const deviceShadow =
	({
		endpoint,
		apiKey,
		log,
	}: {
		endpoint: string
		apiKey: string
		log: Logger
	}) =>
	async (devices: string[]): Promise<DeviceShadow[]> => {
		const params = {
			includeState: true,
			pageLimit: 100,
			deviceIds: devices.join(','),
		}
		const queryString = Object.entries(params)
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map((kv) => kv.map(encodeURIComponent).join('='))
			.join('&')
		const url = `${endpoint.replace(/\/$/, '')}/v1/devices?${queryString}`

		log.info(`Fetching device shadow`, { url })
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
