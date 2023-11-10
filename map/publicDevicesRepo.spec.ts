import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { publicDevicesRepo } from './publicDevicesRepo.js'
import { marshall } from '@aws-sdk/util-dynamodb'
import { assertCall } from '../util/test/assertCall.js'
import { randomUUID } from 'node:crypto'

void describe('publicDevicesRepo()', () => {
	void it('should fetch device data', async () => {
		const id = randomUUID()
		const send = mock.fn(async () =>
			Promise.resolve({
				Items: [
					marshall({
						id,
						deviceId: 'some-device',
						model: 'some-model',
					}),
				],
			}),
		)
		assert.deepEqual(
			await publicDevicesRepo({
				db: {
					send,
				} as any,
				TableName: 'some-table',
			}).getByDeviceId('some-device'),
			{
				id,
				deviceId: 'some-device',
				model: 'some-model',
			},
		)
		assertCall(send, {
			input: {
				TableName: 'some-table',
				IndexName: 'deviceId',
				KeyConditionExpression: '#deviceId = :deviceId',
				ExpressionAttributeNames: {
					'#deviceId': 'deviceId',
					'#id': 'id',
					'#model': 'model',
				},
				ExpressionAttributeValues: {
					':deviceId': {
						S: 'some-device',
					},
				},
				ProjectionExpression: '#deviceId, #id, #model',
				Limit: 1,
			},
		})
	})

	void it('should return null if device is not found', async () =>
		assert.equal(
			await publicDevicesRepo({
				db: {
					send: async () => Promise.resolve({}),
				} as any,
				TableName: 'some-table',
			}).getByDeviceId('some-device'),
			null,
		))
})
