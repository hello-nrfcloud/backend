import {
	normalizedData,
	transformTimestreamData,
} from './historicalDataRepository.js'
jest.mock('@hello.nrfcloud.com/proto/hello', () => ({
	Context: jest.fn().mockReturnValue('model'),
}))

describe('transformTimestreamData', () => {
	it('should extract single attribute from multiple values in single row', () => {
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
		expect(
			transformTimestreamData(data, [{ fromKey: 'avgMA', toKey: 'mA' }]),
		).toEqual(expectedTransformedDataAvg)
	})

	it('should extract multiple attributes from multiple rows with that have same time', () => {
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
		expect(
			transformTimestreamData(data, [
				{ fromKey: 'lat', toKey: 'lat' },
				{ fromKey: 'lng', toKey: 'lng' },
				{ fromKey: 'acc', toKey: 'acc' },
			]),
		).toEqual(expectedTransformedDataAvg)
	})
})

describe('normalizedData', () => {
	it('should normalize the data correctly', () => {
		const data = [
			{
				measure_name: 'temperature',
				'measure_value::double': 25,
			},
			{
				measure_name: 'humidity',
				'measure_value::double': 60,
			},
			{
				measure_name: 'pressure',
				'measure_value::double': 1013,
			},
		]

		const normalized = normalizedData(data)

		expect(normalized).toEqual([
			{
				measure_name: 'temperature',
				temperature: 25,
				'measure_value::double': 25,
			},
			{
				measure_name: 'humidity',
				humidity: 60,
				'measure_value::double': 60,
			},
			{
				measure_name: 'pressure',
				pressure: 1013,
				'measure_value::double': 1013,
			},
		])
	})

	it('should handle missing measure_name or measure_value::double', () => {
		const data = [
			{
				measure_name: 'temperature',
				'measure_value::double': 25,
			},
			{
				measure_name: 'humidity',
			},
			{
				'measure_value::double': 1013,
			},
			{},
		]

		const normalized = normalizedData(data)

		expect(normalized).toEqual([
			{
				measure_name: 'temperature',
				temperature: 25,
				'measure_value::double': 25,
			},
			{
				measure_name: 'humidity',
			},
			{
				'measure_value::double': 1013,
			},
			{},
		])
	})
})
