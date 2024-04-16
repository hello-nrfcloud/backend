import { generateCode } from '@hello.nrfcloud.com/proto/fingerprint'
import { describe, it, mock } from 'node:test'
import { assertCall } from '../util/test/assertCall.js'
import { getDeviceByFingerprint } from './getDeviceByFingerprint.js'
import assert from 'node:assert/strict'
import { marshall } from '@aws-sdk/util-dynamodb'
import { IMEI } from '@hello.nrfcloud.com/bdd-markdown-steps/random'

void describe('getDeviceByFingerprint()', () => {
	void it('should return the device', async () => {
		const deviceId = `oob-${IMEI()}`
		const fingerprint = `29a.${generateCode()}`
		const send = mock.fn(() => ({
			Items: [
				marshall({
					deviceId,
					fingerprint,
					model: 'PCA20035+solar',
					account: 'nordic',
				}),
			],
		}))
		const res = await getDeviceByFingerprint({
			db: {
				send,
			} as any,
			DevicesTableName: 'devices',
			DevicesIndexName: 'fingerprintIndex',
		})(fingerprint)

		assert.deepEqual(res, {
			id: deviceId,
			fingerprint,
			model: 'PCA20035+solar',
			account: 'nordic',
		})

		assertCall(send, {
			input: {
				TableName: 'devices',
				IndexName: 'fingerprintIndex',
				KeyConditionExpression: '#fingerprint = :fingerprint',
				ExpressionAttributeNames: {
					'#fingerprint': 'fingerprint',
				},
				ExpressionAttributeValues: {
					':fingerprint': {
						S: fingerprint,
					},
				},
			},
		})
	})

	void it('should return null if the device is not found', async () => {
		const send = mock.fn(() => ({}))
		const fingerprint = `29a.${generateCode()}`
		const res = await getDeviceByFingerprint({
			db: {
				send,
			} as any,
			DevicesTableName: 'devices',
			DevicesIndexName: 'fingerprintIndex',
		})(fingerprint)

		assert.equal(res, null)

		assertCall(send, {
			input: {
				TableName: 'devices',
				IndexName: 'fingerprintIndex',
				KeyConditionExpression: '#fingerprint = :fingerprint',
				ExpressionAttributeNames: {
					'#fingerprint': 'fingerprint',
				},
				ExpressionAttributeValues: {
					':fingerprint': {
						S: fingerprint,
					},
				},
			},
		})
	})
})
