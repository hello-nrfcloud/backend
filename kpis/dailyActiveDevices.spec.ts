import { dailyActiveDevices } from './dailyActiveDevices.js'

describe('dailyActiveDevices()', () => {
	it('should query the device table index using the provided date', async () => {
		const db = {
			send: jest.fn(async () =>
				Promise.resolve({
					Count: 1,
				}),
			),
		}
		const now = new Date('2022-11-22T23:57:58')
		const res = await dailyActiveDevices(db as any, 'devicesTable')(now)

		expect(res).toEqual(1)
		expect(db.send).toHaveBeenCalledWith(
			expect.objectContaining({
				input: expect.objectContaining({
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
				}),
			}),
		)
	})
})
