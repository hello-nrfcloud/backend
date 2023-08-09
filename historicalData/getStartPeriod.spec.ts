import { getStartPeriod } from './getStartPeriod.js'
import type { ChartType } from './getQueryStatement.js'

describe('getStartPeriod', () => {
	it.each([
		['lastHour', 1688104200000, 'from_milliseconds(1688104200000) - 1hour'],

		['lastDay', 1688104200000, 'from_milliseconds(1688104200000) - 24hour'],
		['lastWeek', 1688104200000, 'from_milliseconds(1688104200000) - 7day'],
		['lastMonth', 1688104200000, 'from_milliseconds(1688104200000) - 30day'],
	])(
		'should return for the time span %s and the time %d the start period %s',
		(timeSpan, time, expectedTimeString) =>
			expect(getStartPeriod(timeSpan as ChartType, time)).toBe(
				expectedTimeString,
			),
	)

	it('throws an error for an invalid chart type', () =>
		expect(() => {
			getStartPeriod('InvalidType' as 'lastHour', 1688104200000)
		}).toThrow('InvalidType is not a valid chart type'))
})
