import { defer, DeferTimeoutError } from './defer.js'

describe('defer', () => {
	it('should resolve the promise with the provided value', async () => {
		const { promise, resolve } = defer<string>(100)
		const value = 'Hello, world!'
		setTimeout(() => resolve(value), 50)
		const result = await promise
		expect(result).toBe(value)
	})

	it('should reject the promise with the provided reason', async () => {
		const { promise, reject } = defer<string>(100)
		const reason = new Error('Rejected!')
		setTimeout(() => reject(reason), 50)
		await expect(promise).rejects.toBe(reason)
	})

	it('should reject the promise with DeferTimeoutError when timeout occurs', async () => {
		const timeoutMS = 100
		const { promise } = defer<string>(timeoutMS)
		await expect(promise).rejects.toThrow(DeferTimeoutError)
	})
})
