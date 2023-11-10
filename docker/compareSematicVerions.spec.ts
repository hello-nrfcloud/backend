import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { compareSemanticVersions } from './compareSematicVerions.js'

void describe('compareSemanticVersions', () => {
	void it('should sort sematic version', () =>
		assert.deepEqual(
			['1', '1.0.0', '1.0.1', '0.0.1'].sort(compareSemanticVersions),
			['0.0.1', '1', '1.0.0', '1.0.1'],
		))
})
