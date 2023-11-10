import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getLocationQueryStatement } from './getLocationQueryStatement.js'

void describe('getLocationQueryStatement', () => {
	void it('returns the correct query statement for location request', () => {
		const result = getLocationQueryStatement({
			type: 'lastMonth',
			attributes: {
				lat: { attribute: 'lat' },
				lng: { attribute: 'lng' },
				acc: { attribute: 'acc' },
				ts: { attribute: 'ts' },
			},
			deviceId: 'device123',
			context: new URL(
				'https://github.com/hello-nrfcloud/proto/transformed/model/location',
			),
			historicalDataDatabaseName: 'database1',
			historicalDataTableName: 'table1',
			now: new Date(1688104200000),
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

		assert.equal(result, expectedQuery)
	})
})
