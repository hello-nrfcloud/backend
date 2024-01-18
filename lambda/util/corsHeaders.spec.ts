import assert from 'node:assert/strict'
import { describe, test as it } from 'node:test'
import { corsHeaders } from './corsHeaders.js'

void describe('corsHeaders()', () => {
	void it('should send the correct headers', () =>
		assert.deepEqual(
			corsHeaders({
				headers: {
					origin: 'https://hello.nrfcloud.com',
				},
			}),
			{
				'Access-Control-Allow-Credentials': true,
				'Access-Control-Allow-Headers': 'content-type, accept, if-match',
				'Access-Control-Expose-Headers': 'x-amzn-requestid, etag',
				'Access-Control-Allow-Methods': 'PUT, DELETE, POST, GET, PATCH',
				'Access-Control-Allow-Origin': 'https://hello.nrfcloud.com',
				'Access-Control-Max-Age': 600,
				Vary: 'Origin',
			},
		))

	void it('should allow localhost', () =>
		assert.deepEqual(
			corsHeaders({
				headers: {
					origin: 'http://localhost:8080',
				},
			})['Access-Control-Allow-Origin'],
			'http://localhost:8080',
		))

	void it('should not allow other domains', () =>
		assert.deepEqual(
			corsHeaders({
				headers: {
					origin: 'https://hello-nrfcloud-com.pages.dev',
				},
			})['Access-Control-Allow-Origin'],
			'https://hello.nrfcloud.com',
		))
})
