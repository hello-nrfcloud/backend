import { testDateAugust } from '../nrfcloud/calculateCosts.spec'
import { getCurrentMonth } from './getCurrentMonth.js'

describe('getCurrentDate', () => {
	it('should get the current month in a YYYY-MM format', () => {
		expect(getCurrentMonth(new Date(testDateAugust))).toMatch('2023-08')
	})
})
