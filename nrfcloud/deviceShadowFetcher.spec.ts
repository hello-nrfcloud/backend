import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { deviceShadowFetcher } from './getDeviceShadowFromnRFCloud.js'

void describe('deviceShadowFetcher()', () => {
	void it('should accept a response without pagination and total devices', async () => {
		const mockFetch = mock.fn(() => ({
			ok: true,
			json: async () =>
				Promise.resolve({
					items: [],
				}),
		}))
		const fetcher = deviceShadowFetcher(
			{
				endpoint: new URL('https://example.com/'),
				apiKey: 'some-key',
			},
			mockFetch as any,
		)

		const res = await fetcher(['device-id'])

		assert.deepEqual(mockFetch.mock.calls[0]?.arguments, [
			`https://example.com/v1/devices?deviceIds=device-id&includeState=true&includeStateMeta=true&pageLimit=100`,
			{
				headers: {
					Accept: 'application/json; charset=utf-8',
					Authorization: 'Bearer some-key',
				},
			},
		])

		assert.deepEqual(res, { shadows: [] })
	})
})
