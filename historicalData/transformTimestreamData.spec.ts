import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { transformTimestreamData } from './transformTimestreamData.js'

void describe('transformTimestreamData', () => {
	void it('should extract single attribute from multiple values in single row', () => {
		const data = [
			{
				avgMA: 3.40141,
				maxMA: 3.50141,
				minMA: 3.30141,
				time: new Date('2021-06-30T00:00:00Z'),
			},
			{
				avgMA: 3.58041,
				maxMA: 3.68041,
				minMA: 3.48041,
				time: new Date('2021-06-30T00:15:00Z'),
			},
		]

		const expectedTransformedDataAvg = [
			{
				mA: 3.40141,
				ts: new Date('2021-06-30T00:00:00Z').getTime(),
			},
			{
				mA: 3.58041,
				ts: new Date('2021-06-30T00:15:00Z').getTime(),
			},
		]
		assert.deepEqual(
			transformTimestreamData(data, [{ fromKey: 'avgMA', toKey: 'mA' }]),
			expectedTransformedDataAvg,
		)
	})

	void it('should extract multiple attributes from multiple rows with that have same time', () => {
		const data = [
			{
				lat: 40.7128,
				time: new Date('2021-06-30T00:00:00Z'),
			},
			{
				lng: 74.006,
				time: new Date('2021-06-30T00:00:00Z'),
			},
			{
				acc: 50,
				time: new Date('2021-06-30T00:00:00Z'),
			},
			{
				lat: -33.8651,
				time: new Date('2021-06-30T00:15:00Z'),
			},
			{
				lng: 151.2099,
				time: new Date('2021-06-30T00:15:00Z'),
			},
			{
				acc: 75,
				time: new Date('2021-06-30T00:15:00Z'),
			},
		]

		const expectedTransformedDataAvg = [
			{
				lat: 40.7128,
				lng: 74.006,
				acc: 50,
				ts: new Date('2021-06-30T00:00:00Z').getTime(),
			},
			{
				lat: -33.8651,
				lng: 151.2099,
				acc: 75,
				ts: new Date('2021-06-30T00:15:00Z').getTime(),
			},
		]
		assert.deepEqual(
			transformTimestreamData(data, [
				{ fromKey: 'lat', toKey: 'lat' },
				{ fromKey: 'lng', toKey: 'lng' },
				{ fromKey: 'acc', toKey: 'acc' },
			]),
			expectedTransformedDataAvg,
		)
	})
})
