import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deg2rad } from './deg2rad.js'

void describe('deg2rad()', () => {
	void it('should convert degrees to radians', () =>
		assert.equal(deg2rad(180), Math.PI))
})
