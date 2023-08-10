export const HistoricalDataTimeSpans = {
	lastHour: {
		bin: '1minute',
		duration: '1hour',
		expires: '1minute',
	},
	lastDay: {
		bin: '5minutes',
		duration: '24hours',
		expires: '5minutes',
	},
	lastWeek: {
		bin: '1hour',
		duration: '7day',
		expires: '5minutes',
	},
	lastMonth: {
		bin: '1hour',
		duration: '30days',
		expires: '15minutes',
		aggregateRequired: true,
	},
}
