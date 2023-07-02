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
				time: '2021-06-30T00:00:00Z',
			},
			{
				avgMA: 3,
				maxMA: 8,
				minMA: 1,
				time: '2021-06-30T00:15:00Z',
			},
		]

		const expectedTransformedDataAvg = [
			{
				mA: 1,
				ts: '2021-06-30T00:00:00Z',
			},
			{
				mA: 3,
				ts: '2021-06-30T00:15:00Z',
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
				time: '2021-06-30T00:00:00Z',
			},
			{
				lng: 2,
				time: '2021-06-30T00:00:00Z',
			},
			{
				acc: 3,
				time: '2021-06-30T00:00:00Z',
			},
			{
				lat: 4,
				time: '2021-06-30T00:15:00Z',
			},
			{
				lng: 5,
				time: '2021-06-30T00:15:00Z',
			},
			{
				acc: 6,
				time: '2021-06-30T00:15:00Z',
			},
		]

		const expectedTransformedDataAvg = [
			{
				lat: 1,
				lng: 2,
				acc: 3,
				ts: '2021-06-30T00:00:00Z',
			},
			{
				lat: 4,
				lng: 5,
				acc: 6,
				ts: '2021-06-30T00:15:00Z',
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
