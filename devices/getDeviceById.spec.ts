import { generateCode } from '@hello.nrfcloud.com/proto/fingerprint'
import { describe, it, mock } from 'node:test'
import { assertCall } from '../util/test/assertCall.js'
import { getDeviceById } from './getDeviceById.js'
import assert from 'node:assert/strict'
import { marshall } from '@aws-sdk/util-dynamodb'
import { IMEI } from '@hello.nrfcloud.com/bdd-markdown-steps/random'

void describe('getDeviceById()', () => {
	void it('should return the device', async () => {
		const deviceId = `oob-${IMEI()}`
		const fingerprint = `29a.${generateCode()}`
		const send = mock.fn(() => ({
			Item: marshall({
				deviceId,
				fingerprint,
				model: 'PCA20035+solar',
				account: 'nordic',
			}),
		}))
		const res = await getDeviceById({
			db: {
				send,
			} as any,
			DevicesTableName: 'devices',
		})(deviceId)

		assert.deepEqual('device' in res && res.device, {
			id: deviceId,
			fingerprint,
			model: 'PCA20035+solar',
			account: 'nordic',
		})

		assertCall(send, {
			input: {
				TableName: 'devices',
				Key: marshall({ deviceId }),
			},
		})
	})

	void it('should return error if the device is not found', async () => {
		const send = mock.fn(() => ({}))
		const deviceId = `oob-${IMEI()}`
		const res = await getDeviceById({
			db: {
				send,
			} as any,
			DevicesTableName: 'devices',
		})(deviceId)

		assert.equal('error' in res, true)

		assertCall(send, {
			input: {
				TableName: 'devices',
				Key: marshall({ deviceId }),
			},
		})
	})
})
