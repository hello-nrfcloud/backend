import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getSensorQueryStatement } from './getSensorQueryStatement.js'

void describe('getSensorQueryStatement', () => {
	void it('returns the correct query statement for gain request', () => {
		const result = getSensorQueryStatement({
			type: 'lastDay',
			attributes: {
				avgMA: { attribute: 'mA', aggregate: 'avg' },
			},
			deviceId: 'device123',
			context: new URL(
				'https://github.com/hello-nrfcloud/proto/transformed/model/gain',
			),
			historicalDataDatabaseName: 'database1',
			historicalDataTableName: 'table1',
			now: new Date(1688104200000),
		})

		const expectedQuery = [
			`SELECT deviceId, bin(time, 5minute) as time, avg(measure_value::double) as "avgMA"`,
			`FROM "database1"."table1"`,
			`WHERE deviceId = 'device123'`,
			`AND "@context" = 'https://github.com/hello-nrfcloud/proto/transformed/model/gain'`,
			`AND time BETWEEN from_milliseconds(1688104200000) - 24hour AND from_milliseconds(1688104200000)`,
			`AND measure_name in ('mA')`,
			`GROUP BY deviceId, bin(time, 5minute)`,
			`ORDER BY bin(time, 5minute) DESC`,
		].join(' ')

		assert.equal(result, expectedQuery)
	})

	void it('returns the correct query statement for battery request', () => {
		const result = getSensorQueryStatement({
			type: 'lastHour',
			attributes: {
				minV: { attribute: '%', aggregate: 'min' },
				maxV: { attribute: '%', aggregate: 'max' },
			},
			deviceId: 'device123',
			context: new URL(
				'https://github.com/hello-nrfcloud/proto/transformed/model/battery',
			),
			historicalDataDatabaseName: 'database1',
			historicalDataTableName: 'table1',
			now: new Date(1688104200000),
		})

		const expectedQuery = [
			`SELECT deviceId, bin(time, 1minute) as time, min(measure_value::double) as "minV", max(measure_value::double) as "maxV"`,
			`FROM "database1"."table1"`,
			`WHERE deviceId = 'device123'`,
			`AND "@context" = 'https://github.com/hello-nrfcloud/proto/transformed/model/battery'`,
			`AND time BETWEEN from_milliseconds(1688104200000) - 1hour AND from_milliseconds(1688104200000)`,
			`AND measure_name in ('%')`,
			`GROUP BY deviceId, bin(time, 1minute)`,
			`ORDER BY bin(time, 1minute) DESC`,
		].join(' ')

		assert.equal(result, expectedQuery)
	})

	void it('returns the correct query statement for weekly battery request', () => {
		const result = getSensorQueryStatement({
			type: 'lastWeek',
			attributes: {
				min: { attribute: '%', aggregate: 'min' },
			},
			deviceId: 'device123',
			context: new URL(
				'https://github.com/hello-nrfcloud/proto/transformed/model/battery',
			),
			historicalDataDatabaseName: 'database1',
			historicalDataTableName: 'table1',
			now: new Date(1688104200000),
		})

		const expectedQuery = [
			`SELECT deviceId, bin(time, 1hour) as time, min(measure_value::double) as "min"`,
			`FROM "database1"."table1"`,
			`WHERE deviceId = 'device123'`,
			`AND "@context" = 'https://github.com/hello-nrfcloud/proto/transformed/model/battery'`,
			`AND time BETWEEN from_milliseconds(1688104200000) - 7day AND from_milliseconds(1688104200000)`,
			`AND measure_name in ('%')`,
			`GROUP BY deviceId, bin(time, 1hour)`,
			`ORDER BY bin(time, 1hour) DESC`,
		].join(' ')

		assert.equal(result, expectedQuery)
	})
})
