import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getStartAndEndForType } from './getStartAndEndForType.js'
import type { HistoricalDataTimeSpans } from './HistoricalDataTimeSpans.js'

void describe('getStartAndEndForType', () => {
	for (const [timeSpan, expectedTimeString] of [
		['lastHour', '1hour'],

		['lastDay', '24hour'],
		['lastWeek', '7day'],
		['lastMonth', '30day'],
	]) {
		void it(`should return for the time span ${timeSpan} the period from -${expectedTimeString} to the given time`, () =>
			assert.deepEqual(
				getStartAndEndForType(
					timeSpan as keyof typeof HistoricalDataTimeSpans,
					1688104200000,
				),
				{
					start: `from_milliseconds(1688104200000) - ${expectedTimeString}`,
					end: 'from_milliseconds(1688104200000)',
				},
			))
	}

	void it('throws an error for an invalid time span', () =>
		assert.throws(() => {
			getStartAndEndForType('InvalidType' as 'lastHour', 1688104200000)
		}, /InvalidType is not a valid time span/))
})
