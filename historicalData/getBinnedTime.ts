import { HistoricalChartTypes } from './historicalDataRepository.js'
import { type ChartType } from './getQueryStatement.js'

export const getBinnedTime = (type: ChartType): string => {
	const selectedType = HistoricalChartTypes[type]
	if (selectedType === undefined)
		throw new Error(`${type} is not a valid chart type`)

	return `bin(time, ${selectedType.bin.replace(/s$/, '')})`
}
