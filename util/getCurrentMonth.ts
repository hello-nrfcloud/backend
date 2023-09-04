export const getCurrentMonth = (date: Date): string => {
	const currentDate = `${date.getFullYear()}-${(date.getMonth() + 1)
		.toString()
		.padStart(2, '0')}`
	return currentDate
}
