import type { Static } from '@sinclair/typebox'
import { HistoricalDataTimeSpans } from './HistoricalDataTimeSpans.js'
import { LocationRequest } from '@hello.nrfcloud.com/proto/hello/history'
import { getStartAndEndForType } from './getStartAndEndForType.js'

export const getLocationQueryStatement = ({
	type,
	attributes,
	historicalDataDatabaseName,
	historicalDataTableName,
	deviceId,
	context,
}: {
	type: keyof typeof HistoricalDataTimeSpans
	attributes: Static<typeof LocationRequest>['attributes']
	historicalDataDatabaseName: string
	historicalDataTableName: string
	deviceId: string
	context: URL
}): string => {
	const { start, end } = getStartAndEndForType(type)
	const measureNames = Object.values(attributes).map(
		({ attribute }) => attribute,
	)
	if (measureNames.length === 0)
		throw new Error(`Request does not have any attribute`)

	const query = [
		`SELECT deviceId, measure_name, measure_value::double, time`,
		`FROM "${historicalDataDatabaseName}"."${historicalDataTableName}"`,
		`WHERE deviceId = '${deviceId}'`,
		`AND "@context" = '${context.toString()}'`,
		`AND measure_name in (${measureNames.map((n) => `'${n}'`).join(',')})`,
		`AND time BETWEEN ${start} AND ${end}`,
		`ORDER BY time DESC`,
	].join(' ')
	return query
}
