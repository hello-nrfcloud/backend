export type HistoricalDataTimeSpan = {
	binIntervalMinutes: number // e.g. 1,
	durationHours: number // e.g. 1,
	expiresMinutes: number // e.g. 1,
}

export const LastHour: HistoricalDataTimeSpan = {
	binIntervalMinutes: 1,
	durationHours: 1,
	expiresMinutes: 1,
}

export const HistoricalDataTimeSpans: Record<string, HistoricalDataTimeSpan> = {
	lastHour: LastHour,
	lastDay: {
		binIntervalMinutes: 15,
		durationHours: 24,
		expiresMinutes: 5,
	},
	lastWeek: {
		binIntervalMinutes: 60,
		durationHours: 24 * 7,
		expiresMinutes: 5,
	},
	lastMonth: {
		binIntervalMinutes: 60,
		durationHours: 24 * 30,
		expiresMinutes: 15,
	},
}
