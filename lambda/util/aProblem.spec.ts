import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { aProblem } from './aProblem.js'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import { corsHeaders } from './corsHeaders.js'

void describe('aProblem()', () => {
	void it('should return a problem response', () =>
		assert.deepEqual(
			aProblem(
				corsHeaders({
					headers: {
						origin: 'https://hello.nrfcloud.com',
					},
				}),
				{
					title: `A Conflict!`,
					status: 409,
				},
			),
			{
				statusCode: 409,
				headers: {
					'content-type': 'application/problem+json',
					'Access-Control-Allow-Credentials': true,
					'Access-Control-Allow-Headers': 'content-type, accept, if-match',
					'Access-Control-Expose-Headers': 'x-amzn-requestid, etag',
					'Access-Control-Allow-Methods': 'PUT, DELETE, POST, GET, PATCH',
					'Access-Control-Allow-Origin': 'https://hello.nrfcloud.com',
					'Access-Control-Max-Age': 600,
					'Cache-Control': 'public, max-age=60',
					Vary: 'Origin',
				},
				body: JSON.stringify({
					'@context': Context.problemDetail.toString(),
					title: `A Conflict!`,
					status: 409,
				}),
			},
		))
})