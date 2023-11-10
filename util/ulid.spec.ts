import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ulid, ulidRegEx } from './ulid.js'

void describe('ulid()', () => {
	void it('should return a Ulid', () => assert.match(ulid(), ulidRegEx))
	void it('should not return the same Ulid', () => {
		const id1 = ulid()
		const id2 = ulid()
		assert.notEqual(id1, id2)
	})
})
