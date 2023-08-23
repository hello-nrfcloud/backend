import data from './api.json'
import dataNoCost from './apiNoCost.json'
import dataLowCost from './apiLowCosts.json'
import { calculateCosts, type UsageSummary } from './calculateCosts.js'

describe('CalculateCosts()', () => {
	it('should return 0 when given empty object', () => {
		const expected = 0
		expect(calculateCosts({} as UsageSummary)).toBe(expected)
	})

	it('should return the minimum fee if no usage', () => {
		const expected = 1.99
		expect(calculateCosts(dataNoCost)).toBe(expected)
	})

	it('Should calculate the costs per month for nRF Cloud', () => {
		const expected = 40.15
		expect(calculateCosts(data)).toBe(expected)
	})

	it('should return 1.99 if monthlyCosts = 1.02', () => {
		const expected = 1.99
		expect(calculateCosts(dataLowCost)).toBe(expected)
	})
})
