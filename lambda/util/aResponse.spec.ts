import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { aResponse } from './aResponse.js'

void describe('aResponse()', () => {
	void it('should return a response', () =>
		assert.deepEqual(
			aResponse(
				200,
				{
					'@context': new URL(`https://example.com/some-context`),
					foo: 'bar',
				},
				60 * 10,
			),
			{
				statusCode: 200,
				headers: {
					'Cache-Control': `public, max-age=${60 * 10}`,
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					'@context': new URL(`https://example.com/some-context`),
					foo: 'bar',
				}),
			},
		))
})
