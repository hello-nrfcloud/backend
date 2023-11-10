import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hashSHA1 } from './hashSHA1.js'

void describe('hashSHA1', () => {
	void it('should return the SHA-1 hash of the input string', () =>
		assert.equal(
			hashSHA1('Hello, World!'),
			'0a0a9f2a6772942557ab5355d76af442f8f65e01',
		))

	void it('should return an empty string if the input is empty', () =>
		assert.equal(hashSHA1(''), 'da39a3ee5e6b4b0d3255bfef95601890afd80709'))
})
