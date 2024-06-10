import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isIMEI } from './isIMEI.js'

void describe('isIMEI()', () => {
	void it('should return true for valid IMEI', () => {
		assert.equal(isIMEI('355123456789012'), true)
		assert.equal(isIMEI('357890123456789'), true)
	})

	void it('should return false for invalid IMEI', () => {
		assert.equal(isIMEI('123456789012345'), false)
		assert.equal(isIMEI('1234567890123456'), false)
		assert.equal(isIMEI('12345678901234a'), false)
		assert.equal(isIMEI(''), false)
		assert.equal(isIMEI(), false)
	})
})
