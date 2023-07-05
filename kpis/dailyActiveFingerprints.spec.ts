import { dailyActiveFingerprints } from './dailyActiveFingerprints.js'

describe('dailyActiveFingerprints()', () => {
	it('should query the device table index using the provided date', async () => {
		const db = {
			send: jest.fn(async () =>
				Promise.resolve({
					Count: 1,
				}),
			),
		}
		const now = new Date('2022-11-22T23:57:58')
		const res = await dailyActiveFingerprints(db as any, 'devicesTable')(now)

		expect(res).toEqual(1)
		expect(db.send).toHaveBeenCalledWith(
			expect.objectContaining({
				input: expect.objectContaining({
					TableName: 'devicesTable',
					IndexName: 'dailyActive',
					KeyConditionExpression: '#source = :source AND #day = :today',
					ExpressionAttributeNames: {
						'#source': 'dailyActive__source',
						'#day': 'dailyActive__day',
						'#deviceId': 'deviceId',
					},
					ExpressionAttributeValues: {
						':source': {
							S: 'websocketAuthorizer',
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
