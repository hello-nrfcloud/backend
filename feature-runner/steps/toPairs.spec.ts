import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { toPairs } from './toPairs.js'

void describe('toPairs', () => {
	void it('should pair items', () =>
		assert.deepEqual(toPairs([{ a: 'foo' }, { a: 'bar' }, { a: 'baz' }]), [
			[{ a: 'foo' }, { a: 'bar' }],
			[{ a: 'bar' }, { a: 'baz' }],
		]))
})
