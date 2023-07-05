import { ulid } from '../util/ulid.js'
import type { HistoricalRequest } from './historicalDataRepository.js'

import {
	getAggregates,
	getBinnedTime,
	getMeasureNames,
	getQueryStatement,
	getStartPeriod,
} from './queryGenerator.js'

jest.mock('@hello.nrfcloud.com/proto/hello', () => ({
	AvailableCharts: {
		lastDay: {
			bin: '5minutes',
			duration: '24hours',
			expires: '5minutes',
		},
		lastHour: {
			bin: '1minute',
			duration: '1hour',
			expires: '1minute',
		},
		lastMonth: {
			bin: '1hour',
			duration: '30days',
			expires: '15minutes',
			aggregateRequired: true,
		},
	},
}))

describe('queryGenerator', () => {
	// let request: Omit<Static<typeof HistoricalDataRequest>, 'data'>
	let request: HistoricalRequest
	beforeEach(() => {
		request = {
			'@context':
				'https://github.com/hello-nrfcloud/proto/historical-data-request',
			'@id': ulid(),
			message: 'gain',
			attributes: {
				avgMA: { attribute: 'mA', aggregate: 'avg' },
			},
			type: 'lastDay',
		}
	})

	describe('getBinnedTime', () => {
		it('should return the binned time string for a valid chart type', () => {
			request.type = 'lastHour'
			expect(getBinnedTime(request)).toBe('bin(time, 1minute)')

			request.type = 'lastDay'
			expect(getBinnedTime(request)).toBe('bin(time, 5minute)')

			request.type = 'lastMonth'
			expect(getBinnedTime(request)).toBe('bin(time, 1hour)')
		})

		it('should throw an error for an invalid chart type', () => {
			request.type = 'InvalidType' as 'lastHour'

			expect(() => getBinnedTime(request)).toThrowError(
				'InvalidType is not a valid chart type',
			)
		})
	})

	describe('getStartPeriod', () => {
		it('returns the correct start period for a valid chart type', () => {
			request.type = 'lastHour'
			expect(getStartPeriod(request, 1688104200000)).toEqual(
				'from_milliseconds(1688104200000) - 1hour',
			)

			request.type = 'lastDay'
			expect(getStartPeriod(request, 1688104200000)).toEqual(
				'from_milliseconds(1688104200000) - 24hour',
			)

			request.type = 'lastMonth'
			expect(getStartPeriod(request, 1688104200000)).toEqual(
				'from_milliseconds(1688104200000) - 30day',
			)
		})

		it('throws an error for an invalid chart type', () => {
			request.type = 'InvalidType' as 'lastHour'

			expect(() => {
				getStartPeriod(request, 1688104200000)
			}).toThrow('InvalidType is not a valid chart type')
		})
	})

	describe('getAggregates', () => {
		it('returns an array of attributes when the request message is "location"', () => {
			request.message = 'location'
			request.attributes = {
				lat: { attribute: 'lat' },
				lng: { attribute: 'lng' },
				acc: { attribute: 'acc' },
				ts: { attribute: 'ts' },
			}

			const result = getAggregates(request)
			expect(result).toEqual([])
		})

		it('returns an array of attributes when the request message is "gain"', () => {
			request.message = 'gain'
			request.attributes = {
				avgMA: { attribute: 'mA', aggregate: 'avg' },
				minMA: { attribute: 'mA', aggregate: 'min' },
				maxMA: { attribute: 'mA', aggregate: 'max' },
				sumMA: { attribute: 'mA', aggregate: 'sum' },
				countMA: { attribute: 'mA', aggregate: 'count' },
			}

			const result = getAggregates(request)
			expect(result).toEqual([
				'avg(measure_value::double) as avgMA',
				'min(measure_value::double) as minMA',
				'max(measure_value::double) as maxMA',
				'sum(measure_value::double) as sumMA',
				'count(measure_value::double) as countMA',
			])
		})

		it('returns an array of attributes when the request message is "voltage"', () => {
			request.message = 'voltage'
			request.attributes = {
				avgV: { attribute: 'v', aggregate: 'avg' },
				minV: { attribute: 'v', aggregate: 'min' },
				maxV: { attribute: 'v', aggregate: 'max' },
				sumV: { attribute: 'v', aggregate: 'sum' },
				countV: { attribute: 'v', aggregate: 'count' },
			}

			const result = getAggregates(request)
			expect(result).toEqual([
				'avg(measure_value::double) as avgV',
				'min(measure_value::double) as minV',
				'max(measure_value::double) as maxV',
				'sum(measure_value::double) as sumV',
				'count(measure_value::double) as countV',
			])
		})

		it('returns an empty array when no attributes are provided', () => {
			request.message = 'location'
			request.attributes = {}

			const result = getAggregates(request)
			expect(result).toEqual([])
		})
	})

	describe('getMeasureNames', () => {
		it('returns an array of measure names when the request message is "location"', () => {
			request.message = 'location'
			request.attributes = {
				lat: { attribute: 'lat' },
				lng: { attribute: 'lng' },
				acc: { attribute: 'acc' },
				ts: { attribute: 'ts' },
			}

			const result = getMeasureNames(request)
			expect(result).toEqual(['lat', 'lng', 'acc', 'ts'])
		})

		it('returns an empty array of measure names if all attributes contain aggregate', () => {
			request.message = 'gain'
			request.attributes = {
				avgMA: { attribute: 'mA', aggregate: 'avg' },
				minMA: { attribute: 'mA', aggregate: 'min' },
				maxMA: { attribute: 'mA', aggregate: 'max' },
				sumMA: { attribute: 'mA', aggregate: 'sum' },
				countMA: { attribute: 'mA', aggregate: 'count' },
			}

			const result = getMeasureNames(request)
			expect(result).toEqual([])
		})
	})

	describe('getQueryStatement', () => {
		beforeEach(() => {
			jest.useFakeTimers()
			jest.setSystemTime(1688104200000)
		})

		afterEach(() => {
			jest.useRealTimers()
		})

		it('returns the correct query statement for gain request', () => {
			request.message = 'gain'
			request.type = 'lastDay'
			request.attributes = {
				avgMA: { attribute: 'mA', aggregate: 'avg' },
			}

			const deviceId = 'device123'
			const context = new URL(
				'https://github.com/hello-nrfcloud/proto/transformed/model/gain',
			)
			const historicalDataDatabaseName = 'database1'
			const historicalDataTableName = 'table1'

			const result = getQueryStatement({
				request,
				deviceId,
				context,
				historicalDataDatabaseName,
				historicalDataTableName,
			})

			const expectedQuery = `
				SELECT deviceId, bin(time, 5minute) as time, avg(measure_value::double) as avgMA
				FROM "database1"."table1"
				WHERE deviceId = 'device123'
				AND "@context" = 'https://github.com/hello-nrfcloud/proto/transformed/model/gain'
				AND time BETWEEN from_milliseconds(1688104200000) - 24hour AND from_milliseconds(1688104200000)
				GROUP BY deviceId, bin(time, 5minute)
				ORDER BY bin(time, 5minute) DESC
			`
				.replace(/\s+/g, ' ')
				.trim()

			expect(result.replace(/\s+/g, ' ').trim()).toEqual(expectedQuery)
		})

		it('returns the correct query statement for voltage request', () => {
			request.message = 'voltage'
			request.type = 'lastHour'
			request.attributes = {
				minV: { attribute: 'v', aggregate: 'min' },
				maxV: { attribute: 'v', aggregate: 'max' },
			}

			const deviceId = 'device123'
			const context = new URL(
				'https://github.com/hello-nrfcloud/proto/transformed/model/voltage',
			)
			const historicalDataDatabaseName = 'database1'
			const historicalDataTableName = 'table1'

			const result = getQueryStatement({
				request,
				deviceId,
				context,
				historicalDataDatabaseName,
				historicalDataTableName,
			})

			const expectedQuery = `
				SELECT deviceId, bin(time, 1minute) as time, min(measure_value::double) as minV, max(measure_value::double) as maxV
				FROM "database1"."table1"
				WHERE deviceId = 'device123'
				AND "@context" = 'https://github.com/hello-nrfcloud/proto/transformed/model/voltage'
				AND time BETWEEN from_milliseconds(1688104200000) - 1hour AND from_milliseconds(1688104200000)
				GROUP BY deviceId, bin(time, 1minute)
				ORDER BY bin(time, 1minute) DESC
			`
				.replace(/\s+/g, ' ')
				.trim()

			expect(result.replace(/\s+/g, ' ').trim()).toEqual(expectedQuery)
		})

		it('returns the correct query statement for location request', () => {
			request.message = 'location'
			request.type = 'lastMonth'
			request.attributes = {
				lat: { attribute: 'lat' },
				lng: { attribute: 'lng' },
				acc: { attribute: 'acc' },
				ts: { attribute: 'ts' },
			}

			const deviceId = 'device123'
			const context = new URL(
				'https://github.com/hello-nrfcloud/proto/transformed/model/location',
			)
			const historicalDataDatabaseName = 'database1'
			const historicalDataTableName = 'table1'

			const result = getQueryStatement({
				request,
				deviceId,
				context,
				historicalDataDatabaseName,
				historicalDataTableName,
			})

			const expectedQuery = `
				SELECT deviceId, measure_name, measure_value::double, time
				FROM "database1"."table1"
				WHERE deviceId = 'device123'
				AND "@context" = 'https://github.com/hello-nrfcloud/proto/transformed/model/location'
				AND measure_name in ('lat','lng','acc','ts')
				AND time BETWEEN from_milliseconds(1688104200000) - 30day AND from_milliseconds(1688104200000)
				ORDER BY time DESC
			`
				.replace(/\s+/g, ' ')
				.trim()

			expect(result.replace(/\s+/g, ' ').trim()).toEqual(expectedQuery)
		})
	})
})
