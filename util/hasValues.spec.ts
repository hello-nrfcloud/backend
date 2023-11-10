import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hasValues } from './hasValues.js'

void describe('hasValues', () => {
	type TestObject = {
		a?: string
		b?: number
		c?: boolean
	}

	const testObject: TestObject = {
		a: 'hello',
		b: 123,
	}

	void it('returns true if all specified properties have values', () => {
		const result = hasValues(testObject, 'a', 'b')
		assert.equal(result, true)
	})

	void it('returns false if any specified properties are null or undefined', () => {
		const result = hasValues(testObject, 'a', 'b', 'c')
		assert.equal(result, false)
	})

	void it('returns true if no properties are specified', () => {
		const result = hasValues(testObject)
		assert.equal(result, true)
	})
})
