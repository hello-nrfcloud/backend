import { transformTimestreamData } from './historicalDataRepository.js'
jest.mock('@hello.nrfcloud.com/proto/hello', () => ({
	Context: jest.fn().mockReturnValue('model'),
}))

describe('transformTimestreamData', () => {
	it('should extract single attribute from multiple values in single row', () => {
		const data = [
			{
				avgMA: 1,
				maxMA: 9,
				minMA: 0,
				time: new Date('2021-06-30T00:00:00Z'),
			},
			{
				avgMA: 3,
				maxMA: 8,
				minMA: 1,
				time: new Date('2021-06-30T00:15:00Z'),
			},
		]

		const expectedTransformedDataAvg = [
			{
				mA: 1,
				ts: new Date('2021-06-30T00:00:00Z').getTime(),
			},
			{
				mA: 3,
				ts: new Date('2021-06-30T00:15:00Z').getTime(),
			},
		]
		expect(
			transformTimestreamData(data, [{ fromKey: 'avgMA', toKey: 'mA' }]),
		).toEqual(expectedTransformedDataAvg)
	})

	it('should extract multiple attributes from multiple rows with that have same time', () => {
		const data = [
			{
				lat: 1,
				time: new Date('2021-06-30T00:00:00Z'),
			},
			{
				lng: 2,
				time: new Date('2021-06-30T00:00:00Z'),
			},
			{
				acc: 3,
				time: new Date('2021-06-30T00:00:00Z'),
			},
			{
				lat: 4,
				time: new Date('2021-06-30T00:15:00Z'),
			},
			{
				lng: 5,
				time: new Date('2021-06-30T00:15:00Z'),
			},
			{
				acc: 6,
				time: new Date('2021-06-30T00:15:00Z'),
			},
		]

		const expectedTransformedDataAvg = [
			{
				lat: 1,
				lng: 2,
				acc: 3,
				ts: new Date('2021-06-30T00:00:00Z').getTime(),
			},
			{
				lat: 4,
				lng: 5,
				acc: 6,
				ts: new Date('2021-06-30T00:15:00Z').getTime(),
			},
		]
		expect(
			transformTimestreamData(data, [
				{ fromKey: 'lat', toKey: 'lat' },
				{ fromKey: 'lng', toKey: 'lng' },
				{ fromKey: 'acc', toKey: 'acc' },
			]),
		).toEqual(expectedTransformedDataAvg)
	})
})
