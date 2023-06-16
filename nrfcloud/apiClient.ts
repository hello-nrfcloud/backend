import { slashless } from '../util/slashless.js'

export type DeviceConfig = Partial<{
	activeMode: boolean // e.g. false
	locationTimeout: number // e.g. 300
	activeWaitTime: number // e.g. 120
	movementResolution: number // e.g. 120
	movementTimeout: number // e.g. 3600
	accThreshAct: number // e.g. 4
	accThreshInact: number // e.g. 4
	accTimeoutInact: number // e.g. 60
	nod: ('gnss' | 'ncell' | 'wifi')[] // e.g. ['nod']
}>
export type Device = {
	id: string // e.g. 'oob-352656108602296'
	state?: {
		reported?: {
			config?: DeviceConfig
			connection?: {
				status?: 'connected' | 'disconnected'
			}
			device?: {
				deviceInfo?: Partial<{
					appVersion: string // e.g. '1.1.0'
					modemFirmware: string // e.g. 'mfw_nrf9160_1.3.4'
					imei: string // e.g. '352656108602296'
					board: string // e.g. 'thingy91_nrf9160'
					hwVer: string // e.g. 'nRF9160 SICA B1A'
				}>
			}
		}
		desired?: {
			config?: DeviceConfig
		}
		version: number
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
	updateConfig: (
		id: string,
		version: number,
		config: DeviceConfig,
	) => Promise<{ error: Error } | { success: boolean }>
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
		getDevice: async (id) =>
			fetch(`${slashless(endpoint)}/v1/devices/${encodeURIComponent(id)}`, {
				headers,
			})
				.then<Device>(async (res) => res.json())
				.then((device) => ({ device })),
		updateConfig: async (id, version, config) =>
			fetch(
				`${slashless(endpoint)}/v1/devices/${encodeURIComponent(id)}/state`,
				{
					headers: {
						...headers,
						'If-Match': version.toString(),
						'Content-Type': 'application/json',
					},
					method: 'PATCH',
					body: JSON.stringify({
						desired: {
							config,
						},
					}),
				},
			)
				.then((res) => {
					if (res.status >= 400)
						return { error: new Error(`Update failed: ${res.status}`) }
					return { success: true }
				})
				.catch((error) => ({ error: error as Error })),
	}
}
