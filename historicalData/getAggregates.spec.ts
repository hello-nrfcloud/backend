import { getAggregates } from './getAggregates.js'

describe('getAggregates', () => {
	it('returns an array of attributes when the request message is "location"', () => {
		const result = getAggregates({
			lat: { attribute: 'lat' },
			lng: { attribute: 'lng' },
			acc: { attribute: 'acc' },
			ts: { attribute: 'ts' },
		})
		expect(result).toEqual([])
	})

	it('returns an array of attributes when the request message is "gain"', () => {
		const result = getAggregates({
			avgMA: { attribute: 'mA', aggregate: 'avg' },
			minMA: { attribute: 'mA', aggregate: 'min' },
			maxMA: { attribute: 'mA', aggregate: 'max' },
			sumMA: { attribute: 'mA', aggregate: 'sum' },
			countMA: { attribute: 'mA', aggregate: 'count' },
		})
		expect(result).toEqual([
			'avg(measure_value::double) as "avgMA"',
			'min(measure_value::double) as "minMA"',
			'max(measure_value::double) as "maxMA"',
			'sum(measure_value::double) as "sumMA"',
			'count(measure_value::double) as "countMA"',
		])
	})

	it('returns an array of attributes when the request message is "battery"', () => {
		const result = getAggregates({
			avgBat: { attribute: '%', aggregate: 'avg' },
			minBat: { attribute: '%', aggregate: 'min' },
			maxBat: { attribute: '%', aggregate: 'max' },
			sumBat: { attribute: '%', aggregate: 'sum' },
			countBat: { attribute: '%', aggregate: 'count' },
		})
		expect(result).toEqual([
			'avg(measure_value::double) as "avgBat"',
			'min(measure_value::double) as "minBat"',
			'max(measure_value::double) as "maxBat"',
			'sum(measure_value::double) as "sumBat"',
			'count(measure_value::double) as "countBat"',
		])
	})

	it('returns an empty array when no attributes are provided', () => {
		const result = getAggregates({})
		expect(result).toEqual([])
	})
})
