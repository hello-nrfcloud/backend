import { getBinnedTime } from './getBinnedTime.js'
import type { HistoricalDataTimeSpans } from './HistoricalDataTimeSpans.js'

describe('getBinnedTime', () => {
	it.each([
		['lastHour', 'bin(time, 1minute)'],
		['lastDay', 'bin(time, 5minute)'],

		['lastWeek', 'bin(time, 1hour)'],

		['lastMonth', 'bin(time, 1hour)'],
	] as [keyof typeof HistoricalDataTimeSpans, string][])(
		'should return for the time span %s the binned time string %s',
		(timeSpan, expectedTimeString) =>
			expect(getBinnedTime(timeSpan)).toEqual(expectedTimeString),
	)

	it('should throw an error for an invalid time span', () =>
		expect(() => getBinnedTime('InvalidType' as 'lastHour')).toThrowError(
			'InvalidType is not a valid time span',
		))
})
