import { HistoricalDataTimeSpans } from './HistoricalDataTimeSpans.js'

export const getBinnedTime = (
	type: keyof typeof HistoricalDataTimeSpans,
): string => {
	const selectedType = HistoricalDataTimeSpans[type]
	if (selectedType === undefined)
		throw new Error(`${type} is not a valid time span`)

	return `bin(time, ${selectedType.bin.replace(/s$/, '')})`
}
