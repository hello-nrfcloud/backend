import { describe, it } from 'node:test'
import assert from 'node:assert'
import { validateWithTypeBox } from '@hello.nrfcloud.com/proto'
import { MemfaultReboots } from './MemfaultReboots.js'
import res from './reboots.json'

void describe('MemfaultReboots()', () => {
	void it('should validate a response', () => {
		assert.equal('errors' in validateWithTypeBox(MemfaultReboots)(res), false)
	})
})
