import { describe, it, mock } from 'node:test'
import { doRequest } from './doRequest.js'
import { assertCall } from '../../util/test/assertCall.js'
import { check, objectMatching } from 'tsmatchers'
import assert from 'node:assert/strict'

void describe('doRequest()', () => {
	void it('should execute a request', async () => {
		const mockFetch = mock.fn(async () =>
			Promise.resolve({
				status: 200,
				headers: new Map<string, string>([
					['content-type', 'application/json'],
				]),
				json: async () => Promise.resolve({ foo: 'bar' }),
			}),
		)
		const assertFn = mock.fn(async () => Promise.resolve())

		const inFlight = doRequest(
			new URL('https://example.com'),
			{
				method: 'POST',
			},
			undefined,
			mockFetch as any,
		)

		await inFlight.match(assertFn)
		const mockArgs: [URL, RequestInit] =
			mockFetch.mock.calls[0]?.arguments ?? ([] as any)
		check(mockArgs[0].toString()).is(new URL('https://example.com').toString())
		check(mockArgs[1]).is(objectMatching({ method: 'POST' }))
		assertCall(assertFn, {
			body: { foo: 'bar' },
		})
	})

	void it('should retry the request if the assert fails', async () => {
		const mockFetch = mock.fn()
		mockFetch.mock.mockImplementationOnce(
			async () =>
				Promise.resolve({
					status: 404,
					headers: new Map<string, string>([]),
				}),
			0,
		)
		mockFetch.mock.mockImplementationOnce(
			async () =>
				Promise.resolve({
					status: 200,
					headers: new Map<string, string>([
						['content-type', 'application/json'],
					]),
					json: async () => Promise.resolve({ foo: 'bar' }),
				}),
			1,
		)
		const assertFn = mock.fn(async ({ response }) =>
			assert.equal(response.status, 200),
		)

		const inFlight = doRequest(
			new URL('https://example.com'),
			{
				method: 'POST',
			},
			undefined,
			mockFetch as any,
		)

		await inFlight.match(assertFn)

		check(assertFn.mock.callCount()).is(2)
		check(mockFetch.mock.callCount()).is(2)
	})
})
