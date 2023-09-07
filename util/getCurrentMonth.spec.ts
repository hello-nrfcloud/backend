import { getCurrentMonth } from './getCurrentMonth.js'

describe('getCurrentDate', () => {
	it('should get the current month in a YYYY-MM format', () => {
		expect(getCurrentMonth(new Date('2023-08-04T10:36:23.000Z'))).toMatch(
			'2023-08',
		)
	})
})
