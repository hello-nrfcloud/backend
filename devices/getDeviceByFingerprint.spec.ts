import { marshall } from '@aws-sdk/util-dynamodb'
import { IMEI } from '@hello.nrfcloud.com/bdd-markdown-steps/random'
import { generateCode } from '@hello.nrfcloud.com/proto/fingerprint'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { assertCall } from '../util/test/assertCall.js'
import { getDeviceByFingerprint } from './getDeviceByFingerprint.js'

void describe('getDeviceByFingerprint()', () => {
	void it('should return the device', async () => {
		const deviceId = `oob-${IMEI()}`
		const fingerprint = `29a.${generateCode()}`
		const send = mock.fn(() => ({
			Items: [
				marshall({
					deviceId,
					fingerprint,
					model: 'PCA20065',
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

		assert.deepEqual('device' in res && res.device, {
			id: deviceId,
			fingerprint,
			model: 'PCA20065',
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

	void it('should return the device with hideDataBefore if set', async () => {
		const deviceId = `oob-${IMEI()}`
		const fingerprint = `29a.${generateCode()}`
		const hideDataBefore = new Date()
		const send = mock.fn(() => ({
			Items: [
				marshall({
					deviceId,
					fingerprint,
					model: 'PCA20065',
					account: 'nordic',
					hideDataBefore: hideDataBefore.toISOString(),
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

		assert.deepEqual('device' in res && res.device, {
			id: deviceId,
			fingerprint,
			model: 'PCA20065',
			account: 'nordic',
			hideDataBefore,
		})
	})

	void it('should return error if the device is not found', async () => {
		const send = mock.fn(() => ({}))
		const fingerprint = `29a.${generateCode()}`
		const res = await getDeviceByFingerprint({
			db: {
				send,
			} as any,
			DevicesTableName: 'devices',
			DevicesIndexName: 'fingerprintIndex',
		})(fingerprint)

		assert.equal('error' in res, true)

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
