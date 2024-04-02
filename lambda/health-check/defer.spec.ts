import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { defer, DeferTimeoutError } from './defer.js'

void describe('defer', () => {
	void it('should resolve the promise with the provided value', async () => {
		const { promise, resolve } = defer<string>(100)
		const value = 'Hello, world!'
		setTimeout(() => resolve(value), 50)
		const result = await promise
		assert.equal(result, value)
	})

	void it('should reject the promise with the provided reason', async () => {
		const { promise, reject } = defer<string>(100)
		const reason = new Error('Rejected!')
		setTimeout(() => reject(reason), 50)
		await assert.rejects(promise, reason)
	})

	void it('should reject the promise with DeferTimeoutError when timeout occurs', async () => {
		const timeoutMS = 100
		const { promise } = defer<string>(timeoutMS)
		await assert.rejects(promise, DeferTimeoutError)
	})
})
