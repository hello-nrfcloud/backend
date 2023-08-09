import { getBinnedTime } from './getBinnedTime.js'
import { type ChartType } from './getQueryStatement.js'

describe('getBinnedTime', () => {
	it.each([
		['lastHour', 'bin(time, 1minute)'],
		['lastDay', 'bin(time, 5minute)'],

		['lastWeek', 'bin(time, 1hour)'],

		['lastMonth', 'bin(time, 1hour)'],
	])(
		'should return for the time span %s the binned time string %s',
		(timeSpan, expectedTimeString) =>
			expect(getBinnedTime(timeSpan as ChartType)).toEqual(expectedTimeString),
	)

	it('should throw an error for an invalid chart type', () =>
		expect(() => getBinnedTime('InvalidType' as 'lastHour')).toThrowError(
			'InvalidType is not a valid chart type',
		))
})
