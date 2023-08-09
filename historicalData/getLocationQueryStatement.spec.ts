import { getLocationQueryStatement } from './getLocationQueryStatement.js'

describe('getLocationQueryStatement', () => {
	beforeEach(() => {
		jest.useFakeTimers()
		jest.setSystemTime(1688104200000)
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('returns the correct query statement for location request', () => {
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
