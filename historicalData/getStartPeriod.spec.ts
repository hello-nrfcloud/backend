import { getStartPeriod } from './getStartPeriod.js'
import { HistoricalDataTimeSpans } from './HistoricalDataTimeSpans.js'

describe('getStartPeriod', () => {
	it.each([
		['lastHour', '1hour'],
		['lastDay', '24hour'],
		['lastWeek', '7day'],
		['lastMonth', '30day'],
	])(
		'should return for the time span %s the period -%s from the given time',
		(timeSpan, expectedTimeString) =>
			expect(
				getStartPeriod(
					timeSpan as keyof typeof HistoricalDataTimeSpans,
					1688104200000,
				),
			).toEqual(`from_milliseconds(1688104200000) - ${expectedTimeString}`),
	)

	it('throws an error for an invalid time span', () =>
		expect(() => {
			getStartPeriod('InvalidType' as 'lastHour', 1688104200000)
		}).toThrow('InvalidType is not a valid time span'))
})
