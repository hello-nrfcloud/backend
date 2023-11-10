import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cellId } from './cellId.js'

void describe('cellId', () => {
	void it('should generate a cellId', () =>
		assert.equal(
			cellId({
				area: 42,
				mccmnc: 53005,
				cell: 666,
			}),
			'53005-42-666',
		))
})
