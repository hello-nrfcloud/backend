import {
	Type,
	type TSchema,
	type Static,
	type TObject,
} from '@sinclair/typebox'
import { slashless } from '../util/slashless.js'
import type { Nullable } from '../util/types.js'
import { validateWithTypeBox } from '@hello.nrfcloud.com/proto'
import type { ErrorObject } from 'ajv'

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
})

const Page = <T extends TSchema>(Item: T) =>
	Type.Object({
		total: Type.Integer(),
		items: Type.Array(Item),
	})
const Devices = Page(Device)

const AccountInfo = Type.Object({
	mqttEndpoint: Type.String(), // e.g. 'mqtt.nrfcloud.com'
	mqttTopicPrefix: Type.String(), // e.g. 'prod/a0673464-e4e1-4b87-bffd-6941a012067b/',
	team: Type.Object({
		tenantId: Type.String(), // e.g. 'bbfe6b73-a46a-43ad-94bd-8e4b4a7847ce',
		name: Type.String(), // e.g. 'hello.nrfcloud.com'
	}),
	plan: Type.Object({
		currentMonthCosts: Type.Array(
			Type.Object({
				price: Type.Number(), // e.g. 0.1
				quantity: Type.Number(), // e.g. 9
				serviceDescription: Type.String(), // e.g. 'Devices in your account'
				serviceId: Type.Union([
					Type.Literal('Devices'),
					Type.Literal('Messages'),
					Type.Literal('SCELL'),
					Type.Literal('MCELL'),
				]),
				total: Type.Number(), // e.g. 0.9
			}),
		),
		currentMonthTotalCost: Type.Number(), // e.g. 2.73
		name: Type.Union([Type.Literal('PRO'), Type.Literal('DEVELOPER')]),
		proxyUsageDeclarations: Type.Object({
			AGPS: Type.Number(), // e.g. 0
			GROUND_FIX: Type.Number(), // e.g. 200
			PGPS: Type.Number(), // e.g. 0
		}),
	}),
	role: Type.Union([
		Type.Literal('owner'),
		Type.Literal('admin'),
		Type.Literal('editor'),
		Type.Literal('viewer'),
	]),
	tags: Type.Array(Type.String()),
})

const BulkOpsRequest = Type.Object({
	bulkOpsRequestId: Type.String(), // e.g. '01EZZJVDQJPWT7V4FWNVDHNMM5'
	endpoint: Type.Union([
		Type.Literal('PROVISION_DEVICES'),
		Type.Literal('REGISTER_PUBLIC_KEYS'),
		Type.Literal('VERIFY_ATTESTATION_TOKENS'),
		Type.Literal('VERIFY_JWTS'),
		Type.Literal('CLAIM_DEVICE_OWNERSHIP'),
	]), // e.g. 'PROVISION_DEVICES'
	status: Type.Union([
		Type.Literal('PENDING'),
		Type.Literal('IN_PROGRESS'),
		Type.Literal('FAILED'),
		Type.Literal('SUCCEEDED'),
	]), // e.g. 'PENDING'
	requestedAt: Type.String({
		pattern:
			'^\\d{4}-[01]\\d-[0-3]\\dT[0-2]\\d:[0-5]\\d:[0-5]\\d.\\d+([+-][0-2]\\d:[0-5]\\d|Z)$',
	}), // e.g. '2020-06-25T21:05:12.830Z'
	completedAt: Type.Optional(
		Type.String({
			pattern:
				'^\\d{4}-[01]\\d-[0-3]\\dT[0-2]\\d:[0-5]\\d:[0-5]\\d.\\d+([+-][0-2]\\d:[0-5]\\d|Z)$',
		}),
	), // e.g. '2020-06-25T21:05:12.830Z'
	uploadedDataUrl: Type.String(), // e.g. 'https://bulk-ops-requests.nrfcloud.com/a5592ec1-18ae-4d9d-bc44-1d9bd927bbe9/provision_devices/01EZZJVDQJPWT7V4FWNVDHNMM5.csv'
	resultDataUrl: Type.Optional(Type.String()), // e.g. 'https://bulk-ops-requests.nrfcloud.com/a5592ec1-18ae-4d9d-bc44-1d9bd927bbe9/provision_devices/01EZZJVDQJPWT7V4FWNVDHNMM5-result.json'
	errorSummaryUrl: Type.Optional(Type.String()), // e.g. 'https://bulk-ops-requests.nrfcloud.com/a5592ec1-18ae-4d9d-bc44-1d9bd927bbe9/provision_devices/01EZZJVDQJPWT7V4FWNVDHNMM5.json'
})

type FwType =
	| 'APP'
	| 'MODEM'
	| 'BOOT'
	| 'SOFTDEVICE'
	| 'BOOTLOADER'
	| 'MDM_FULL'

class ValidationError extends Error {
	public errors: ErrorObject[]
	public readonly isValidationError = true
	constructor(errors: ErrorObject[]) {
		super(`Validation errors`)
		this.name = 'ValidationError'
		this.errors = errors
	}
}

const validate = async <T extends TObject>(
	SchemaObject: T,
	response: Response,
): Promise<Static<T>> => {
	if (response.ok) {
		const maybeResponse = validateWithTypeBox(SchemaObject)(
			await response.json(),
		)
		if ('errors' in maybeResponse) {
			throw new ValidationError(maybeResponse.errors)
		}

		return maybeResponse.value
	} else {
		throw new Error(`Error fetching status: ${response.status}`)
	}
}

const onError = (error: Error): { error: Error | ValidationError } => ({
	error,
})

export const apiClient = ({
	endpoint,
	apiKey,
}: {
	endpoint: URL
	apiKey: string
}): {
	listDevices: () => Promise<
		{ error: Error | ValidationError } | { devices: Static<typeof Devices> }
	>
	getDevice: (
		id: string,
	) => Promise<
		{ error: Error | ValidationError } | { device: Static<typeof Device> }
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
	account: () => Promise<
		| { error: Error | ValidationError }
		| {
				account: Static<typeof AccountInfo>
		  }
	>
	getBulkOpsStatus: (bulkOpsId: string) => Promise<
		| { error: Error | ValidationError }
		| {
				status: Static<typeof BulkOpsRequest>
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
				.then(async (res) => ({ devices: await validate(Devices, res) }))
				.catch(onError),
		getDevice: async (id) =>
			fetch(`${slashless(endpoint)}/v1/devices/${encodeURIComponent(id)}`, {
				headers,
			})
				.then(async (res) => ({ device: await validate(Device, res) }))
				.catch(onError),
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
			)
				.then((res) => {
					if (res.status >= 400) throw new Error(`Update failed: ${res.status}`)
					return { success: true }
				})
				.catch(onError),
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
		account: async () =>
			fetch(`${slashless(endpoint)}/v1/account`, {
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/octet-stream',
				},
			})
				.then(async (account) => ({
					account: await validate(AccountInfo, account),
				}))
				.catch(onError),
		getBulkOpsStatus: async (bulkOpsId) =>
			fetch(
				`${slashless(endpoint)}/v1/bulk-ops-requests/${encodeURIComponent(
					bulkOpsId,
				)}`,
				{
					headers: {
						...headers,
						'Content-Type': 'application/json',
					},
				},
			)
				.then(async (res) => ({ status: await validate(BulkOpsRequest, res) }))
				.catch(onError),
	}
}
