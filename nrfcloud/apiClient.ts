import { Type, type TSchema, type Static } from '@sinclair/typebox'
import { slashless } from '../util/slashless.js'
import type { Nullable } from '../util/types.js'
import { ValidationError, validatedFetch } from './validatedFetch.js'

export const DeviceConfig = Type.Partial(
	Type.Object({
		activeMode: Type.Boolean(), // e.g. false
		locationTimeout: Type.Number(), // e.g. 300
		activeWaitTime: Type.Number(), // e.g. 120
		movementResolution: Type.Number(), // e.g. 120
		movementTimeout: Type.Number(), // e.g. 3600
		accThreshAct: Type.Number(), // e.g. 4
		accThreshInact: Type.Number(), // e.g. 4
		accTimeoutInact: Type.Number(), // e.g. 60
		nod: Type.Array(
			Type.Union([
				Type.Literal('gnss'),
				Type.Literal('ncell'),
				Type.Literal('wifi'),
			]),
		), // e.g. ['nod']
	}),
)

const Device = Type.Object({
	id: Type.String(),
	state: Type.Optional(
		Type.Object({
			reported: Type.Optional(
				Type.Object({
					config: Type.Optional(DeviceConfig),
					connection: Type.Optional(
						Type.Object({
							status: Type.Optional(
								Type.Union([
									Type.Literal('connected'),
									Type.Literal('disconnected'),
								]),
							),
						}),
					),
					device: Type.Optional(
						Type.Object({
							deviceInfo: Type.Optional(
								Type.Partial(
									Type.Object({
										appVersion: Type.String(), // e.g. '1.1.0'
										modemFirmware: Type.String(), // e.g. 'mfw_nrf9160_1.3.4'
										imei: Type.String(), // e.g. '352656108602296'
										board: Type.String(), // e.g. 'thingy91_nrf9160'
										hwVer: Type.String(), // e.g. 'nRF9160 SICA B1A'
									}),
								),
							),
						}),
					),
				}),
			),
			desired: Type.Optional(
				Type.Object({
					config: Type.Optional(DeviceConfig),
				}),
			),
			version: Type.Number(),
		}),
	),
	firmware: Type.Optional(
		Type.Object({
			app: Type.Optional(
				Type.Object({
					name: Type.String({ minLength: 1 }),
					version: Type.String({ minLength: 1 }),
				}),
			),
		}),
	),
})

const Page = <T extends TSchema>(Item: T) =>
	Type.Object({
		total: Type.Integer(),
		items: Type.Array(Item),
	})
const Devices = Page(Device)

type FwType =
	| 'APP'
	| 'MODEM'
	| 'BOOT'
	| 'SOFTDEVICE'
	| 'BOOTLOADER'
	| 'MDM_FULL'

export const apiClient = (
	{
		endpoint,
		apiKey,
	}: {
		endpoint: URL
		apiKey: string
	},
	fetchImplementation?: typeof fetch,
): {
	listDevices: () => Promise<
		{ error: Error | ValidationError } | { result: Static<typeof Devices> }
	>
	getDevice: (
		id: string,
	) => Promise<
		{ error: Error | ValidationError } | { result: Static<typeof Device> }
	>
	updateConfig: (
		id: string,
		config: Nullable<Omit<Static<typeof DeviceConfig>, 'nod'>> &
			Pick<Static<typeof DeviceConfig>, 'nod'>,
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
			fwTypes?: FwType[]
			// A unique ES256 X.509 certificate in PEM format, wrapped in double quotes (to allow for line breaks in CSV)	/^-{5}BEGIN CERTIFICATE-{5}(\r\n|\r|\n)([^-]+)(\r\n|\r|\n)-{5}END CERTIFICATE-{5}(\r\n|\r|\n)$/
			certPem: string
		}[],
	) => Promise<{ error: Error } | { bulkOpsRequestId: string }>
} => {
	const headers = {
		Authorization: `Bearer ${apiKey}`,
		Accept: 'application/json; charset=utf-8',
	}
	const vf = validatedFetch({ endpoint, apiKey }, fetchImplementation)
	return {
		listDevices: async () =>
			vf(
				{
					resource: `devices?${new URLSearchParams({
						pageLimit: '100',
						deviceNameFuzzy: 'oob-',
					}).toString()}`,
				},
				Devices,
			),
		getDevice: async (id) =>
			vf({ resource: `devices/${encodeURIComponent(id)}` }, Device),
		updateConfig: async (id, config) =>
			fetch(
				`${slashless(endpoint)}/v1/devices/${encodeURIComponent(id)}/state`,
				{
					headers: {
						...headers,
						'Content-Type': 'application/json',
					},
					method: 'PATCH',
					body: JSON.stringify({
						desired: {
							config,
						},
					}),
				},
			).then((res) => {
				if (res.status >= 400)
					return { error: new Error(`Update failed: ${res.status}`) }
				return { success: true }
			}),
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

			if (registrationResult.ok !== true) {
				return {
					error: new Error(
						`${registrationResult.statusText} (${registrationResult.status})`,
					),
				}
			}

			const res = await registrationResult.json()

			if ('bulkOpsRequestId' in res)
				return { bulkOpsRequestId: res.bulkOpsRequestId }

			if ('code' in res && 'message' in res)
				return {
					error: new Error(
						`${res.message} (${res.code}): ${JSON.stringify(res)}`,
					),
				}

			return { error: new Error(`Import failed: ${JSON.stringify(res)}`) }
		},
	}
}
