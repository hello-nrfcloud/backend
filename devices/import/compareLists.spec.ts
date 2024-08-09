import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compareLists } from './compareLists.js'

void describe('compareLists', () => {
	void it('should return true when both lists have the same entries', () => {
		const a = new Map<string, { fingerprint: string }>()
		a.set('IMEI1', { fingerprint: 'fingerprint1' })
		a.set('IMEI2', { fingerprint: 'fingerprint2' })

		const b = new Map<string, { fingerprint: string }>()
		b.set('IMEI1', { fingerprint: 'fingerprint1' })
		b.set('IMEI2', { fingerprint: 'fingerprint2' })

		assert.equal(compareLists(a, b), true)
	})

	void it('should return false when b is missing an entry from a', () => {
		const a = new Map<string, { fingerprint: string }>()
		a.set('IMEI1', { fingerprint: 'fingerprint1' })
		a.set('IMEI2', { fingerprint: 'fingerprint2' })

		const b = new Map<string, { fingerprint: string }>()
		b.set('IMEI1', { fingerprint: 'fingerprint1' })

		assert.equal(compareLists(a, b), false)
	})

	void it('should return false when fingerprint mismatch occurs', () => {
		const a = new Map<string, { fingerprint: string }>()
		a.set('IMEI1', { fingerprint: 'fingerprint1' })

		const b = new Map<string, { fingerprint: string }>()
		b.set('IMEI1', { fingerprint: 'fingerprint2' })

		assert.equal(compareLists(a, b), false)
	})
})
