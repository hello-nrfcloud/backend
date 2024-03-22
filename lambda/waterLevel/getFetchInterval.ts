export const getFetchIntervalForAPI = (
	specificDate?: Date,
): { from: string; to: string } => {
	const { from, to } = getFetchInterval(specificDate)
	return { from: toAPI(from), to: toAPI(to) }
}

const toAPI = (date: Date) => date.toISOString().substring(0, 16)

export const getFetchInterval = (
	specificDate?: Date,
): { from: Date; to: Date } => {
	const currentDateAndTime = specificDate ?? new Date()
	const numberOfMlSeconds = currentDateAndTime.getTime()
	const addMlSecond = 60 * 60 * 1000
	const from = new Date(numberOfMlSeconds - addMlSecond)
	const to = currentDateAndTime
	return { from, to }
}
