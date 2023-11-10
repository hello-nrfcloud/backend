import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { checkMatchingQueryParams } from './checkMatchingQueryParams.js'

void describe('checkMatchingQueryParams', () => {
	void it('should return true when expected is subset of actual parameters', () => {
		const actual = {
			param1: 'value1',
			param2: 'value2',
		}
		const expected = {
			param1: 'value1',
		}

		const result = checkMatchingQueryParams(actual, expected)
		assert.equal(result, true)
	})

	void it('should return true when expected contains regular expression and it matches', () => {
		const actual = {
			param1: 'value1,value2,value3',
		}
		const expected = {
			param1: '/\\bvalue2\\b/',
		}

		const result = checkMatchingQueryParams(actual, expected)
		assert.equal(result, true)
	})

	void it('should return false when expected does not match actual parameters', () => {
		const actual = {
			param1: 'value1',
			param2: 'value2',
		}
		const expected = {
			param1: 'value2',
		}

		const result = checkMatchingQueryParams(actual, expected)
		assert.equal(result, false)
	})

	void it('should return false when actual is null', () => {
		const actual = null
		const expected = {
			param1: 'value1',
		}

		const result = checkMatchingQueryParams(actual, expected)
		assert.equal(result, false)
	})

	void it('should return true when expected parameters having number or boolean', () => {
		const actual = {
			param1: 'true',
			param2: '1',
		}
		const expected = {
			param1: true,
			param2: 1,
		}

		const result = checkMatchingQueryParams(actual, expected)
		assert.equal(result, true)
	})
})
