import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { slashless } from './slashless.js'

void describe('slashless()', () => {
	void it('should remove the slash from an URL and convert it to a string', () =>
		assert.equal(
			slashless(new URL('https://api.nrfcloud.com/')),
			'https://api.nrfcloud.com',
		))
})
