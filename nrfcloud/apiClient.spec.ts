import { apiClint } from './apiClient.js' // Replace "your-module" with the actual path to your module
jest.mock('./createToken.js', () => ({
	createToken: jest.fn().mockReturnValue('token'),
}))
const fetch = (global.fetch = jest.fn())

describe('apiClient', () => {
	const endpoint = 'https://example.com'
	const serviceKey = 'your-service-key'
	const teamId = 'your-team-id'

	describe('groundFix', () => {
		const payload = {
			lat: 1.23,
			lon: 4.56,
			uncertainty: 0.5,
		}

		afterEach(() => {
			jest.clearAllMocks()
		})

		test('should return valid GroundFixMessage', async () => {
			const ts = Date.now()

			fetch.mockResolvedValue({
				ok: true,
				json: jest.fn().mockResolvedValue({
					lat: 1.23,
					lon: 4.56,
					uncertainty: 0.5,
				}),
			})

			const client = apiClint({ endpoint, serviceKey, teamId })
			const result = await client.groundFix(payload, ts)

			expect(fetch).toHaveBeenCalledWith(`${endpoint}/v1/location/ground-fix`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer token`,
				},
				body: JSON.stringify(payload),
			})

			expect(result).toEqual({
				'@context':
					'https://github.com/bifravst/Muninn-backend/device-location',
				ts,
				lat: 1.23,
				lng: 4.56,
				acc: 0.5,
			})
		})

		test('should throw an error if fetch fails', async () => {
			const ts = Date.now()

			fetch.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
			})

			const client = apiClint({ endpoint, serviceKey, teamId })
			await expect(client.groundFix(payload, ts)).rejects.toThrow(
				'Ground fix API failed with 500: Internal Server Error',
			)
		})

		test('should throw an error if the response is invalid', async () => {
			const ts = Date.now()

			fetch.mockResolvedValue({
				ok: true,
				json: jest.fn().mockResolvedValue({
					invalidProperty: 'invalidValue',
				}),
			})

			const client = apiClint({ endpoint, serviceKey, teamId })
			await expect(client.groundFix(payload, ts)).rejects.toThrow(
				'Invalid ground fix response',
			)
		})
	})
})
