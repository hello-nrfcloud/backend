import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { correctOffset } from './correctOffset.ts'
import { isUnixTimeInSeconds } from './isUnixTimeInSeconds.ts'

void describe('correctOffset()', () => {
	void it('should correct timestamps in the future of up to 60 seconds', () => {
		assert.equal(
			isUnixTimeInSeconds(correctOffset(Date.now() / 1000 + 1)),
			true,
			'should correct 1 second in the future',
		)
		assert.equal(
			isUnixTimeInSeconds(correctOffset(Date.now() / 1000 + 60)),
			true,
			'should correct 60 seconds in the future',
		)
		assert.equal(
			isUnixTimeInSeconds(correctOffset(Date.now() / 1000 + 61)),
			false,
			'should not correct 61 seconds in the future',
		)
	})
})
