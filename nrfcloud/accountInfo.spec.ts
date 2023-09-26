import { getAccountInfo } from './getAccountInfo.js'
import APIresponse from './test-data/account.json'

describe('getAccountInfo()', () => {
	it('return the account info', async () => {
		const res = await getAccountInfo(
			{
				endpoint: new URL('https://example.com/'),
				apiKey: 'some-key',
			},
			jest.fn(() => ({
				ok: true,
				json: async () => Promise.resolve(APIresponse),
			})) as any,
		)
		expect('error' in res).toBe(false)
		expect(res).toMatchObject({
			mqttEndpoint: 'mqtt.nrfcloud.com',
			mqttTopicPrefix: 'prod/b8b26bc5-2814-4063-b4fa-83ecddb2fec7/',
			team: {
				tenantId: 'b8b26bc5-2814-4063-b4fa-83ecddb2fec7',
				name: 'XXX',
			},
		})
	})
})
