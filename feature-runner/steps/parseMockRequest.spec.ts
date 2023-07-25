import { parseMockRequest } from './parseMockRequest.js'

describe('parseMockRequest()', () => {
	it('should parse method, resource, protocol, headers and body', () =>
		expect(
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
		).toMatchObject({
			method: 'PATCH',
			resource: '/v1/devices/foo/state',
			protocol: 'HTTP/1.1',
			headers: {
				'Content-Length': '36',
				'Content-Type': 'application/json',
				'If-Match': '8835',
			},
			body: '{"desired":{"config":{"nod":null}}}',
		}))
})
