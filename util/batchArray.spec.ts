import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { batchArray } from './batchArray.js'

void describe('batchArray()', () => {
	void it('should batch an array', () =>
		assert.deepEqual(batchArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]))
})
