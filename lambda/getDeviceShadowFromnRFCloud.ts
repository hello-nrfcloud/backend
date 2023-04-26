import { type Logger } from '@aws-lambda-powertools/logger'

type DeviceShadow = {
	id: string
	state: {
		reported: Record<string, any>
		version: number
		metadata: Record<string, any>
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
	async (deviceId: string): Promise<DeviceShadow> => {
		const url = `${endpoint.replace(/\/$/, '')}/v1/devices/${deviceId}`

		log.info(`Fetching device shadow`, { url })
		const res = await fetch(url, {
			method: 'get',
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		})

		if (res.ok) {
			const data = await res.json()
			return data as DeviceShadow
		} else {
			const error = await res.json()
			throw new Error(`${error.code}: ${error.message}`)
		}
	}
