import { getStartAndEndForType } from './getStartAndEndForType.js'
import type { HistoricalDataTimeSpans } from './HistoricalDataTimeSpans.js'

describe('getStartAndEndForType', () => {
	it.each([
		['lastHour', '1hour'],

		['lastDay', '24hour'],
		['lastWeek', '7day'],
		['lastMonth', '30day'],
	])(
		'should return for the time span %s the period from -%s to the given time',
		(timeSpan, expectedTimeString) =>
			expect(
				getStartAndEndForType(
					timeSpan as keyof typeof HistoricalDataTimeSpans,
					1688104200000,
				),
			).toMatchObject({
				start: `from_milliseconds(1688104200000) - ${expectedTimeString}`,
				end: 'from_milliseconds(1688104200000)',
			}),
	)

	it('throws an error for an invalid time span', () =>
		expect(() => {
			getStartAndEndForType('InvalidType' as 'lastHour', 1688104200000)
		}).toThrow('InvalidType is not a valid time span'))
})
