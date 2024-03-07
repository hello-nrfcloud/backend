import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { aProblem } from './aProblem.js'
import { Context } from '@hello.nrfcloud.com/proto/hello'

void describe('aProblem()', () => {
	void it('should return a problem response', () =>
		assert.deepEqual(
			aProblem({
				title: `A Conflict!`,
				status: 409,
			}),
			{
				statusCode: 409,
				headers: {
					'content-type': 'application/problem+json',
					'Cache-Control': 'public, max-age=60',
				},
				body: JSON.stringify({
					'@context': Context.problemDetail.toString(),
					title: `A Conflict!`,
					status: 409,
				}),
			},
		))
})
