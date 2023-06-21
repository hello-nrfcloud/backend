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
type AccountInfo = {
	mqttEndpoint: string // e.g. 'mqtt.nrfcloud.com'
	mqttTopicPrefix: string // e.g. 'prod/a0673464-e4e1-4b87-bffd-6941a012067b/',
	team: {
		tenantId: string // e.g. 'bbfe6b73-a46a-43ad-94bd-8e4b4a7847ce',
		name: string // e.g. 'hello.nrfcloud.com'
	}
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
	registerDevices: (
		devices: {
			// A globally unique device id (UUIDs are highly recommended)	/^[a-z0-9:_-]{1,128}$/i
			deviceId: string
			// A custom device type (for example humidity-sensor) to help you better recognize or categorize your devices. Include "gateway" in your subType if you want to provision it as a Gateway. This will give the device additional MQTT permissions for gateway-related topics. Otherwise, it is provisioned as a Generic device.	/[a-zA-Z0-9_.,@\/:#-]{0,799}/
			subType?: string
			// A list of pipe-delimited tags to create groups of devices (e.g., warehouse|sensor|east)	Each tag: /^[a-zA-Z0-9_.@:#-]+$/
			tags?: string[]
			// A list of pipe-delimited firmware types that each device supports for FOTA (e.g., APP|MODEM)
			fwTypes?:
				| 'APP'
				| 'MODEM'
				| 'BOOT'
				| 'SOFTDEVICE'
				| 'BOOTLOADER'
				| 'MDM_FULL'
			// A unique ES256 X.509 certificate in PEM format, wrapped in double quotes (to allow for line breaks in CSV)	/^-{5}BEGIN CERTIFICATE-{5}(\r\n|\r|\n)([^-]+)(\r\n|\r|\n)-{5}END CERTIFICATE-{5}(\r\n|\r|\n)$/
			certPem: string
		}[],
	) => Promise<{ error: Error } | { success: boolean }>
	account: () => Promise<
		| { error: Error }
		| {
				account: AccountInfo
		  }
	>
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
		registerDevices: async (devices) => {
			const bulkRegistrationPayload = devices
				.map(({ deviceId, subType, tags, fwTypes, certPem }) => [
					[
						deviceId,
						subType ?? '',
						(tags ?? []).join('|'),
						((fwTypes as any) ?? []).join('|'),
						`"${certPem}"`,
					],
				])
				.map((cols) => cols.join(','))
				.join('\n')

			const registrationResult = await fetch(
				`${slashless(endpoint)}/v1/devices`,
				{
					headers: {
						Authorization: `Bearer ${apiKey}`,
						'Content-Type': 'application/octet-stream',
					},
					method: 'POST',
					body: bulkRegistrationPayload,
				},
			)

			const res = await registrationResult.json()

			if ('bulkOpsRequestId' in res) return { success: true }

			if ('code' in res && 'message' in res)
				return { error: new Error(`${res.message} (${res.code})`) }

			return { success: false }
		},
		account: async () =>
			fetch(`${slashless(endpoint)}/v1/account`, {
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/octet-stream',
				},
			})
				.then<AccountInfo>(async (res) => res.json())
				.then((account) => ({ account }))
				.catch((err) => ({ error: err as Error })),
	}
}
