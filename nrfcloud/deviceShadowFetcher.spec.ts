import { deviceShadowFetcher } from './getDeviceShadowFromnRFCloud.js'

describe('deviceShadowFetcher()', () => {
	it('should accept a response without pagination and total devices', async () => {
		const mockFetch = jest.fn(() => ({
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

		expect(mockFetch).toHaveBeenCalledWith(
			`https://example.com/v1/devices?deviceIds=device-id&includeState=true&includeStateMeta=true&pageLimit=100`,
			expect.objectContaining({
				headers: {
					Accept: 'application/json; charset=utf-8',
					Authorization: 'Bearer some-key',
				},
			}),
		)

		expect(res).toMatchObject([])
	})
})
