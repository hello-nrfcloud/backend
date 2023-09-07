import { getCurrentMonth } from './getCurrentMonth.js'

const testDateAugust = 1691145383000

describe('getCurrentDate', () => {
	it('should get the current month in a YYYY-MM format', () => {
		expect(getCurrentMonth(new Date(testDateAugust))).toMatch('2023-08')
	})
})
