import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseMockResponse } from './parseMockResponse.js'

void describe('parseMockResponse()', () => {
	void it('should parse protocol, statusCode, headers and body', () =>
		assert.deepEqual(
			parseMockResponse(
				[
					`HTTP/1.1 202 Accepted`,
					`Content-Length: 36`,
					`Content-Type: application/json`,
					``,
					`{"desired":{"config":{"nod":null}}}`,
				].join('\n'),
			),
			{
				statusCode: 202,
				protocol: 'HTTP/1.1',
				headers: {
					'Content-Length': '36',
					'Content-Type': 'application/json',
				},
				body: '{"desired":{"config":{"nod":null}}}',
			},
		))
})
