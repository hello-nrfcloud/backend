import type { Static } from '@sinclair/typebox'
import { getBinnedTime } from './getBinnedTime.js'
import { HistoricalDataTimeSpans } from './HistoricalDataTimeSpans.js'
import { CommonAggregatedRequest } from '@hello.nrfcloud.com/proto/hello/history'
import { getStartAndEndForType } from './getStartAndEndForType.js'

export const getSensorQueryStatement = ({
	type,
	attributes,
	historicalDataDatabaseName,
	historicalDataTableName,
	deviceId,
	context,
	now,
}: {
	type: keyof typeof HistoricalDataTimeSpans
	attributes: Static<typeof CommonAggregatedRequest>['attributes']
	historicalDataDatabaseName: string
	historicalDataTableName: string
	deviceId: string
	context: URL
	now?: Date
}): string => {
	const { start, end } = getStartAndEndForType(
		type,
		(now ?? new Date()).getTime(),
	)
	const binnedTime = getBinnedTime(type)
	const aggs = Object.entries(attributes).map(
		([prop, { aggregate }]) =>
			`${aggregate}(measure_value::double) as "${prop}"`,
	)
	const measureNames = [
		...new Set(Object.values(attributes).map(({ attribute }) => attribute)),
	]
	const query = [
		`SELECT deviceId, ${binnedTime} as time, ${aggs.join(', ')}`,
		`FROM "${historicalDataDatabaseName}"."${historicalDataTableName}"`,
		`WHERE deviceId = '${deviceId}'`,
		`AND "@context" = '${context.toString()}'`,
		`AND time BETWEEN ${start} AND ${end}`,
		`AND measure_name in (${measureNames.map((n) => `'${n}'`).join(',')})`,
		`GROUP BY deviceId, ${binnedTime}`,
		`ORDER BY ${binnedTime} DESC`,
	].join(' ')
	return query
}
