import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { padVersion } from './padVersion.js'

void describe('padVersion()', () => {
	for (const [unpadded, padded] of [
		['1', '1.0.0'],
		['2.0', '2.0.0'],
		['3.0.1', '3.0.1'],
	] as [string, string][]) {
		void it(`it should pad ${unpadded} to ${padded}`, () =>
			assert.equal(padVersion(unpadded), padded))
	}
})
