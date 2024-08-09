import { validateWithTypeBox } from '@hello.nrfcloud.com/proto'
import { type Static } from '@sinclair/typebox'
import { ValidationError } from '../util/ValidationError.js'
import { MemfaultReboots } from './MemfaultReboots.js'

export const v = validateWithTypeBox(MemfaultReboots)

// Pagination is not implemented, we only care about the most recent reboots.
export const getDeviceReboots =
	(
		{
			organizationAuthToken,
			organizationSlug,
			projectSlug,
			apiEndpoint,
		}: {
			organizationAuthToken: string
			organizationSlug: string
			projectSlug: string
			apiEndpoint: URL
		},
		fetchImplementation?: typeof fetch,
	) =>
	async (
		deviceId: string,
		since: string,
	): Promise<{ error: Error } | { value: Static<typeof MemfaultReboots> }> => {
		// Devices use the IMEI (device_serial) as the device ID
		const imei = deviceId.replace(/^oob-/, '')
		const res = await (fetchImplementation ?? fetch)(
			new URL(
				`./api/v0/organizations/${organizationSlug}/projects/${projectSlug}/devices/${imei}/reboots?${new URLSearchParams(
					{
						since,
					},
				).toString()}`,
				apiEndpoint,
			),
			{
				headers: new Headers({
					Authorization: `Basic ${Buffer.from(`:${organizationAuthToken}`).toString('base64')}`,
				}),
			},
		)
		if (!res.ok)
			return {
				error: new Error(
					`Failed to fetch reboots: ${res.status}. ${await res.text()}`,
				),
			}

		const maybeValid = v(await res.json())
		if ('errors' in maybeValid)
			return { error: new ValidationError(maybeValid.errors) }
		return maybeValid
	}
