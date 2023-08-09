import { getStartPeriod } from './getStartPeriod.js'
import { HistoricalDataTimeSpans } from './HistoricalDataTimeSpans.js'

export const getStartAndEndForType = (
	type: keyof typeof HistoricalDataTimeSpans,
	startMS = Date.now(),
): { start: string; end: string } => {
	const start = getStartPeriod(type, startMS)
	const end = `from_milliseconds(${startMS})`

	return { start, end }
}
