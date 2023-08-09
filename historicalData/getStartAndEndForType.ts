import { HistoricalDataTimeSpans } from './HistoricalDataTimeSpans.js'

export const getStartAndEndForType = (
	type: keyof typeof HistoricalDataTimeSpans,
	startMS = Date.now(),
): { start: string; end: string } => {
	const start = getStartPeriod(type, startMS)
	const end = `from_milliseconds(${startMS})`

	return { start, end }
}

const getStartPeriod = (
	type: keyof typeof HistoricalDataTimeSpans,
	startMS: number,
): string => {
	const selectedType = HistoricalDataTimeSpans[type]
	if (selectedType === undefined)
		throw new Error(`${type} is not a valid time span`)

	return `from_milliseconds(${startMS}) - ${selectedType.duration.replace(
		/s$/,
		'',
	)}`
}
