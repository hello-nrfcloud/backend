import { getCurrentMonthlyCosts } from './getCurrentMonthlyCosts.js'
import APIresponse from './test-data/account.json'

describe('getCurrentMonthlyCosts()', () => {
	it("return the current month's total cost for an account", async () => {
		const res = await getCurrentMonthlyCosts(
			{
				endpoint: new URL('https://example.com/'),
				apiKey: 'some-key',
			},
			jest.fn(() => ({
				ok: true,
				json: async () => Promise.resolve(APIresponse),
			})) as any,
		)()
		expect('error' in res).toBe(false)
		expect('currentMonthTotalCost' in res && res.currentMonthTotalCost).toEqual(
			24.03,
		)
	})
})
