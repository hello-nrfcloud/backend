import { AvailableCharts } from '@hello.nrfcloud.com/proto/hello'
import type { HistoricalRequest } from './historicalDataRepository.js'

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
	const start = getStartPeriod(request, startMS)
	const end = `from_milliseconds(${startMS})`

	if (request.message === 'location') {
		const measureNames = getMeasureNames(request)
		if (measureNames.length === 0)
			throw new Error(`Request does not have any attribute`)

		const query = `
		SELECT deviceId, measure_name, measure_value::double, time
		FROM "${historicalDataDatabaseName}"."${historicalDataTableName}"
		WHERE deviceId = '${deviceId}'
		AND "@context" = '${context.toString()}'
		AND measure_name in (${measureNames.map((n) => `'${n}'`).join(',')})
		AND time BETWEEN ${start} AND ${end}
		ORDER BY time DESC
		`
		return query
	} else {
		const binnedTime = getBinnedTime(request)
		const aggs = getAggregates(request)

		const query = `
			SELECT deviceId, ${binnedTime} as time, ${aggs.join(', ')}
			FROM "${historicalDataDatabaseName}"."${historicalDataTableName}"
			WHERE deviceId = '${deviceId}'
			AND "@context" = '${context.toString()}'
			AND time BETWEEN ${start} AND ${end}
			GROUP BY deviceId, ${binnedTime}
			ORDER BY ${binnedTime} DESC
  	`
		return query
	}
}

export const getMeasureNames = (request: HistoricalRequest): string[] => {
	const aggs: string[] = []
	for (const prop in request.attributes) {
		const attribute =
			request.attributes[prop as keyof typeof request.attributes]
		if (!('aggregate' in attribute)) {
			aggs.push(`${attribute.attribute}`)
		}
	}

	return aggs
}

export const getBinnedTime = (request: HistoricalRequest): string => {
	const type = request.type
	const selectedType = AvailableCharts[type]
	if (selectedType === undefined)
		throw new Error(`${type} is not a valid chart type`)

	return `bin(time, ${selectedType.bin.replace(/s$/, '')})`
}

export const getStartPeriod = (
	request: HistoricalRequest,
	startMS: number,
): string => {
	const type = request.type
	const selectedType = AvailableCharts[type]
	if (selectedType === undefined)
		throw new Error(`${type} is not a valid chart type`)

	return `from_milliseconds(${startMS}) - ${selectedType.duration.replace(
		/s$/,
		'',
	)}`
}

export const getAggregates = (request: HistoricalRequest): string[] => {
	const aggs: string[] = []

	for (const prop in request.attributes) {
		const attribute =
			request.attributes[prop as keyof typeof request.attributes]
		if ('aggregate' in attribute) {
			aggs.push(`${attribute.aggregate}(measure_value::double) as ${prop}`)
		}
	}

	return aggs
}
