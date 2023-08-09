import type { Static } from '@sinclair/typebox'
import { ulid } from '../util/ulid.js'
import type { GainRequest } from '@hello.nrfcloud.com/proto/hello/history/HistoricalDataRequest.js'
import { getSensorQueryStatement } from './getQueryStatement.js'

describe('getQueryStatement', () => {
	beforeEach(() => {
		jest.useFakeTimers()
		jest.setSystemTime(1688104200000)
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('returns the correct query statement for gain request', () => {
		const request: Static<typeof GainRequest> = {
			'@context':
				'https://github.com/hello-nrfcloud/proto/historical-data-request',
			'@id': ulid(),
			message: 'gain',
			type: 'lastDay',
			attributes: {
				avgMA: { attribute: 'mA', aggregate: 'avg' },
			},
		}

		const deviceId = 'device123'
		const context = new URL(
			'https://github.com/hello-nrfcloud/proto/transformed/model/gain',
		)
		const historicalDataDatabaseName = 'database1'
		const historicalDataTableName = 'table1'

		const result = getSensorQueryStatement({
			request,
			deviceId,
			context,
			historicalDataDatabaseName,
			historicalDataTableName,
		})

		const expectedQuery = [
			`SELECT deviceId, bin(time, 5minute) as time, avg(measure_value::double) as "avgMA"`,
			`FROM "database1"."table1"`,
			`WHERE deviceId = 'device123'`,
			`AND "@context" = 'https://github.com/hello-nrfcloud/proto/transformed/model/gain'`,
			`AND time BETWEEN from_milliseconds(1688104200000) - 24hour AND from_milliseconds(1688104200000)`,
			`GROUP BY deviceId, bin(time, 5minute)`,
			`ORDER BY bin(time, 5minute) DESC`,
		].join(' ')

		expect(result).toEqual(expectedQuery)
	})

	it('returns the correct query statement for battery request', () => {
		const request: HistoricalRequest = {
			'@context':
				'https://github.com/hello-nrfcloud/proto/historical-data-request',
			'@id': ulid(),
			message: 'battery',
			type: 'lastHour',
			attributes: {
				minV: { attribute: '%', aggregate: 'min' },
				maxV: { attribute: '%', aggregate: 'max' },
			},
		}

		const deviceId = 'device123'
		const context = new URL(
			'https://github.com/hello-nrfcloud/proto/transformed/model/battery',
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

		const expectedQuery = [
			`SELECT deviceId, bin(time, 1minute) as time, min(measure_value::double) as "minV", max(measure_value::double) as "maxV"`,
			`FROM "database1"."table1"`,
			`WHERE deviceId = 'device123'`,
			`AND "@context" = 'https://github.com/hello-nrfcloud/proto/transformed/model/battery'`,
			`AND time BETWEEN from_milliseconds(1688104200000) - 1hour AND from_milliseconds(1688104200000)`,
			`GROUP BY deviceId, bin(time, 1minute)`,
			`ORDER BY bin(time, 1minute) DESC`,
		].join(' ')

		expect(result).toEqual(expectedQuery)
	})

	it('returns the correct query statement for weekly battery request', () => {
		const request: HistoricalRequest = {
			'@context':
				'https://github.com/hello-nrfcloud/proto/historical-data-request',
			'@id': ulid(),
			message: 'battery',
			type: 'lastWeek',
			attributes: {
				min: { attribute: '%', aggregate: 'min' },
			},
		}

		const deviceId = 'device123'
		const context = new URL(
			'https://github.com/hello-nrfcloud/proto/transformed/model/battery',
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

		const expectedQuery = [
			`SELECT deviceId, bin(time, 1hour) as time, min(measure_value::double) as "min"`,
			`FROM "database1"."table1"`,
			`WHERE deviceId = 'device123'`,
			`AND "@context" = 'https://github.com/hello-nrfcloud/proto/transformed/model/battery'`,
			`AND time BETWEEN from_milliseconds(1688104200000) - 7day AND from_milliseconds(1688104200000)`,
			`GROUP BY deviceId, bin(time, 1hour)`,
			`ORDER BY bin(time, 1hour) DESC`,
		].join(' ')

		expect(result).toEqual(expectedQuery)
	})

	it('returns the correct query statement for location request', () => {
		const request: HistoricalRequest = {
			'@context':
				'https://github.com/hello-nrfcloud/proto/historical-data-request',
			'@id': ulid(),
			message: 'location',
			type: 'lastMonth',
			attributes: {
				lat: { attribute: 'lat' },
				lng: { attribute: 'lng' },
				acc: { attribute: 'acc' },
				ts: { attribute: 'ts' },
			},
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

		const expectedQuery = [
			`SELECT deviceId, measure_name, measure_value::double, time`,
			`FROM "database1"."table1"`,
			`WHERE deviceId = 'device123'`,
			`AND "@context" = 'https://github.com/hello-nrfcloud/proto/transformed/model/location'`,
			`AND measure_name in ('lat','lng','acc','ts')`,
			`AND time BETWEEN from_milliseconds(1688104200000) - 30day AND from_milliseconds(1688104200000)`,
			`ORDER BY time DESC`,
		].join(' ')

		expect(result).toEqual(expectedQuery)
	})
})
