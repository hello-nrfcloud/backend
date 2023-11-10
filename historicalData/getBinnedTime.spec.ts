import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getBinnedTime } from './getBinnedTime.js'
import type { HistoricalDataTimeSpans } from './HistoricalDataTimeSpans.js'

void describe('getBinnedTime', () => {
	for (const [timeSpan, expectedTimeString] of [
		['lastHour', 'bin(time, 1minute)'],
		['lastDay', 'bin(time, 5minute)'],
		['lastWeek', 'bin(time, 1hour)'],
		['lastMonth', 'bin(time, 1hour)'],
	] as [keyof typeof HistoricalDataTimeSpans, string][]) {
		void it(`should return for the time span ${timeSpan} the binned time string ${expectedTimeString}`, () =>
			assert.equal(getBinnedTime(timeSpan), expectedTimeString))
	}

	void it('should throw an error for an invalid time span', () =>
		assert.throws(
			() => getBinnedTime('InvalidType' as 'lastHour'),
			/InvalidType is not a valid time span/,
		))
})
