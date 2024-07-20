import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import nock from 'nock'
import { fetchJWTPublicKeys } from './fetchJWTPublicKeys.js'

void describe('fetchJWTPublicKeys()', () => {
	void it('should fetch JWKS from URL', async () => {
		const scope = nock('https://api.nordicsemi.world')
			.get('/2024-04-15/.well-known/jwks.json')
			.reply(
				200,
				{
					'@context': 'https://datatracker.ietf.org/doc/html/rfc7517',
					keys: [
						{
							alg: 'ES512',
							kid: '48edc40e-0d5a-4f3b-a8f2-e3e157f79867',
							use: 'sig',
							key: '-----BEGIN PUBLIC KEY-----\nMIGbMBAGByqGSM49AgEGBSuBBAAjA4GGAAQBwUW2spTqOToNrwmwxymja0DBpMN+\nUWTZHoi3Z7h8lC+Mel+zVv3ty19tfTIokd22IyQ8KylUb2BhUwRs42asvJ8ALAXP\nq+GmiBaVY5Bz1mlmHo+DVI5/Fikrrk7Ut1VGRITkY3dI6invfQm+UdtMwa+V9Ub4\nDgA0IOB+NTPe7d5FkOs=\n-----END PUBLIC KEY-----\n',
						},
					],
				},
				{
					'content-type': 'application/json; charset=utf-8',
				},
			)

		const keys = await fetchJWTPublicKeys(
			new URL('https://api.nordicsemi.world/2024-04-15/.well-known/jwks.json'),
		)

		assert.equal(scope.isDone(), true)
		assert.deepEqual(
			keys,
			new Map<string, string>([
				[
					'48edc40e-0d5a-4f3b-a8f2-e3e157f79867',
					'-----BEGIN PUBLIC KEY-----\nMIGbMBAGByqGSM49AgEGBSuBBAAjA4GGAAQBwUW2spTqOToNrwmwxymja0DBpMN+\nUWTZHoi3Z7h8lC+Mel+zVv3ty19tfTIokd22IyQ8KylUb2BhUwRs42asvJ8ALAXP\nq+GmiBaVY5Bz1mlmHo+DVI5/Fikrrk7Ut1VGRITkY3dI6invfQm+UdtMwa+V9Ub4\nDgA0IOB+NTPe7d5FkOs=\n-----END PUBLIC KEY-----\n',
				],
			]),
		)
	})

	void it('should log an error', async () => {
		const onError = mock.fn()
		const scope = nock('https://api.nordicsemi.world')
			.get('/2024-04-15/.well-known/jwks.json')
			.reply(404, 'Not found!', {
				'content-type': 'application/text; charset=utf-8',
			})

		const keys = await fetchJWTPublicKeys(
			new URL('https://api.nordicsemi.world/2024-04-15/.well-known/jwks.json'),
			onError,
		)

		assert.equal(scope.isDone(), true)
		assert.deepEqual(keys, new Map<string, string>())
		assert.match(
			onError.mock.calls[0]?.arguments[0].message,
			/Failed to fetch JWKS: 404 Not Found \(Not found!\)/,
		)
	})
})
