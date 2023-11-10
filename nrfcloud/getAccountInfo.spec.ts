import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getAccountInfo } from './getAccountInfo.js'
import APIresponse from './test-data/account.json'
import { check, objectMatching } from 'tsmatchers'

void describe('getAccountInfo()', () => {
	void it('return the account info', async () => {
		const res = await getAccountInfo(
			{
				endpoint: new URL('https://example.com/'),
				apiKey: 'some-key',
			},
			() =>
				Promise.resolve({
					ok: true,
					json: async () => Promise.resolve(APIresponse),
				}) as any,
		)
		assert.equal('error' in res, false)
		check(res).is(
			objectMatching({
				mqttEndpoint: 'mqtt.nrfcloud.com',
				mqttTopicPrefix: 'prod/b8b26bc5-2814-4063-b4fa-83ecddb2fec7/',
				team: {
					tenantId: 'b8b26bc5-2814-4063-b4fa-83ecddb2fec7',
					name: 'XXX',
				},
			}),
		)
	})
})
