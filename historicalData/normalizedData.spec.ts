import { normalizedData } from './normalizedData.js'

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
