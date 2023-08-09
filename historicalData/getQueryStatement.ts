import { getAggregates } from './getAggregates.js'
import { getBinnedTime } from './getBinnedTime.js'
import { getMeasureNames } from './getMeasureNames.js'
import { getStartPeriod } from './getStartPeriod.js'
import {
	HistoricalChartTypes,
	type HistoricalRequest,
} from './historicalDataRepository.js'

export type ChartType = keyof typeof HistoricalChartTypes
export const getQueryStatement = ({
	request,
	deviceId,
	context,
	historicalDataDatabaseName,
	historicalDataTableName,
}: {
	request: HistoricalRequest
	deviceId: string
	context: URL
	historicalDataDatabaseName: string
	historicalDataTableName: string
}): string => {
	const startMS = Date.now()
	const start = getStartPeriod(request.type as ChartType, startMS)
	const end = `from_milliseconds(${startMS})`

	if (request.message === 'location') {
		const measureNames = getMeasureNames(request.attributes)
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
	} else {
		const binnedTime = getBinnedTime(request.type as ChartType)
		const aggs = getAggregates(request.attributes)

		const query = [
			`SELECT deviceId, ${binnedTime} as time, ${aggs.join(', ')}`,
			`FROM "${historicalDataDatabaseName}"."${historicalDataTableName}"`,
			`WHERE deviceId = '${deviceId}'`,
			`AND "@context" = '${context.toString()}'`,
			`AND time BETWEEN ${start} AND ${end}`,
			`GROUP BY deviceId, ${binnedTime}`,
			`ORDER BY ${binnedTime} DESC`,
		].join(' ')
		return query
	}
}
