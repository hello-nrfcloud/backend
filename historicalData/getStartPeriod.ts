import { HistoricalChartTypes } from './historicalDataRepository.js'
import { type ChartType } from './getQueryStatement.js'

export const getStartPeriod = (type: ChartType, startMS: number): string => {
	const selectedType = HistoricalChartTypes[type]
	if (selectedType === undefined)
		throw new Error(`${type} is not a valid chart type`)

	return `from_milliseconds(${startMS}) - ${selectedType.duration.replace(
		/s$/,
		'',
	)}`
}
