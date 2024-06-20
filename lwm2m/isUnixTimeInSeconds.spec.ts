import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isUnixTimeInSeconds } from './isUnixTimeInSeconds.js'

void describe('isUnixTimeInSeconds()', () => {
	void it('should return true for valid Unix time in seconds', () => {
		assert.equal(isUnixTimeInSeconds(1700000000), true)
		assert.equal(isUnixTimeInSeconds(Date.now() / 1000), true)
	})

	void it('should return false for invalid Unix time in seconds', () => {
		assert.equal(isUnixTimeInSeconds('1700000000'), false)
		assert.equal(isUnixTimeInSeconds(1699999999), false)
		assert.equal(isUnixTimeInSeconds(Date.now()), false)
	})
})
