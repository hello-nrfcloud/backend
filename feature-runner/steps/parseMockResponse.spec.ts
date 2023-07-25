import { parseMockResponse } from './parseMockResponse.js'

describe('parseMockResponse()', () => {
	it('should parse protocol, statusCode, headers and body', () =>
		expect(
			parseMockResponse(
				[
					`HTTP/1.1 202 Accepted`,
					`Content-Length: 36`,
					`Content-Type: application/json`,
					``,
					`{"desired":{"config":{"nod":null}}}`,
				].join('\n'),
			),
		).toMatchObject({
			statusCode: 202,
			protocol: 'HTTP/1.1',
			headers: {
				'Content-Length': '36',
				'Content-Type': 'application/json',
			},
			body: '{"desired":{"config":{"nod":null}}}',
		}))
})
