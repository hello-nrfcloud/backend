import { slashless } from '../util/slashless.js'

type Device = {
	id: string // e.g. 'oob-352656108602296'
	state?: {
		reported?: {
			connection?: {
				status?: 'connected' | 'disconnected'
			}
		}
	}
}
type Page<Item> = {
	total: number
	items: Item[]
}
export const apiClient = ({
	endpoint,
	apiKey,
}: {
	endpoint: URL
	apiKey: string
}): {
	listDevices: () => Promise<{ error: Error } | { devices: Page<Device> }>
	getDevice: (id: string) => Promise<{ error: Error } | { device: Device }>
} => {
	const headers = {
		Authorization: `Bearer ${apiKey}`,
		Accept: 'application/json; charset=utf-8',
	}
	return {
		listDevices: async () =>
			fetch(
				`${slashless(endpoint)}/v1/devices?${new URLSearchParams({
					pageLimit: '100',
					deviceNameFuzzy: 'oob-',
				}).toString()}`,
				{ headers },
			)
				.then<Page<Device>>(async (res) => res.json())
				.then((devices) => ({ devices })),
		getDevice: async (id: string) =>
			fetch(`${slashless(endpoint)}/v1/devices/${encodeURIComponent(id)}`, {
				headers,
			})
				.then<Device>(async (res) => res.json())
				.then((device) => ({ device })),
	}
}
