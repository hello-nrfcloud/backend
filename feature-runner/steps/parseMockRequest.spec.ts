import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseMockRequest } from './parseMockRequest.js'

void describe('parseMockRequest()', () => {
	void it('should parse method, resource, protocol, headers and body', () =>
		assert.deepEqual(
			parseMockRequest(
				[
					`PATCH /v1/devices/foo/state HTTP/1.1`,
					`Content-Length: 36`,
					`Content-Type: application/json`,
					`If-Match: 8835`,
					``,
					`{"desired":{"config":{"nod":null}}}`,
				].join('\n'),
			),
			{
				method: 'PATCH',
				resource: '/v1/devices/foo/state',
				protocol: 'HTTP/1.1',
				headers: {
					'Content-Length': '36',
					'Content-Type': 'application/json',
					'If-Match': '8835',
				},
				body: '{"desired":{"config":{"nod":null}}}',
			},
		))
})
