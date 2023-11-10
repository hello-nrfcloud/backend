import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getCurrentMonthlyCosts } from './getCurrentMonthlyCosts.js'
import APIresponse from './test-data/account.json'

void describe('getCurrentMonthlyCosts()', () => {
	void it("return the current month's total cost for an account", async () => {
		const res = await getCurrentMonthlyCosts(
			{
				endpoint: new URL('https://example.com/'),
				apiKey: 'some-key',
			},
			() =>
				Promise.resolve({
					ok: true,
					json: async () => Promise.resolve(APIresponse),
				}) as any,
		)()
		assert.equal('error' in res, false)
		assert.equal(
			'currentMonthTotalCost' in res && res.currentMonthTotalCost,
			24.03,
		)
	})
})
