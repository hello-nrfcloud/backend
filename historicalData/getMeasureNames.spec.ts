import { getMeasureNames } from './getMeasureNames.js'

describe('getMeasureNames', () => {
	it('returns an array of measure names when the request message is "location"', () => {
		const result = getMeasureNames({
			lat: { attribute: 'lat' },
			lng: { attribute: 'lng' },
			acc: { attribute: 'acc' },
			ts: { attribute: 'ts' },
		})
		expect(result).toEqual(['lat', 'lng', 'acc', 'ts'])
	})

	it('returns an empty array of measure names if all attributes contain aggregate', () => {
		const result = getMeasureNames({
			avgMA: { attribute: 'mA', aggregate: 'avg' },
			minMA: { attribute: 'mA', aggregate: 'min' },
			maxMA: { attribute: 'mA', aggregate: 'max' },
			sumMA: { attribute: 'mA', aggregate: 'sum' },
			countMA: { attribute: 'mA', aggregate: 'count' },
		})
		expect(result).toEqual([])
	})
})
