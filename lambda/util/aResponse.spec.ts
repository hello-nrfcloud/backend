import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { aResponse } from './aResponse.js'
import { corsHeaders } from './corsHeaders.js'

void describe('aResponse()', () => {
	void it('should return a response', () =>
		assert.deepEqual(
			aResponse(
				corsHeaders({
					headers: {
						origin: 'https://hello.nrfcloud.com',
					},
				}),
				200,
				{
					'@context': new URL(`https://example.com/some-context`),
					foo: 'bar',
				},
				{
					'Cache-control': `public, max-age=${60 * 10}`,
				},
			),
			{
				statusCode: 200,
				headers: {
					'Cache-control': `public, max-age=${60 * 10}`,
					'content-type': 'application/json',
					'Access-Control-Allow-Credentials': true,
					'Access-Control-Allow-Headers': 'content-type, accept, if-match',
					'Access-Control-Expose-Headers': 'x-amzn-requestid, etag',
					'Access-Control-Allow-Methods': 'PUT, DELETE, POST, GET, PATCH',
					'Access-Control-Allow-Origin': 'https://hello.nrfcloud.com',
					'Access-Control-Max-Age': 600,
					Vary: 'Origin',
				},
				body: JSON.stringify({
					'@context': new URL(`https://example.com/some-context`),
					foo: 'bar',
				}),
			},
		))
})
