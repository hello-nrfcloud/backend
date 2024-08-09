import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compareSemanticVersions } from './compareSemanticVersions.js'

void describe('compareSemanticVersions', () => {
	void it('should sort semantic versions', () =>
		assert.deepEqual(
			['1', '1.0.0', '1.0.1', '0.0.1'].sort(compareSemanticVersions),
			['0.0.1', '1', '1.0.0', '1.0.1'],
		))
})
