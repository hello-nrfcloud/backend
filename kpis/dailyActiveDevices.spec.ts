import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { assertCall } from '../util/test/assertCall.js'
import { dailyActiveDevices } from './dailyActiveDevices.js'

void describe('dailyActiveDevices()', () => {
	void it('should query the device table index using the provided date', async () => {
		const send = mock.fn(async () =>
			Promise.resolve({
				Count: 1,
			}),
		)
		const now = new Date('2022-11-22T23:57:58')
		const res = await dailyActiveDevices({ send } as any, 'devicesTable')(now)

		assert.equal(res, 1)
		assertCall(send, {
			input: {
				TableName: 'devicesTable',
				IndexName: 'dailyActive',
				KeyConditionExpression: '#source = :source AND #day = :today',
				ExpressionAttributeNames: {
					'#source': 'source',
					'#day': 'day',
					'#deviceId': 'deviceId',
				},
				ExpressionAttributeValues: {
					':source': {
						S: 'deviceMessage',
					},
					':today': {
						S: now.toISOString().slice(0, 10),
					},
				},
				ProjectionExpression: '#deviceId',
			},
		})
	})
})
