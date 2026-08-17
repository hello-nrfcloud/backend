import { validateWithTypeBox } from '@hello.nrfcloud.com/proto'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { MemfaultReboots } from './MemfaultReboots.ts'
import res from './reboots.json' with { type: 'json' }

void describe('MemfaultReboots()', () => {
	void it('should validate a response', () => {
		assert.equal('errors' in validateWithTypeBox(MemfaultReboots)(res), false)
	})
})
