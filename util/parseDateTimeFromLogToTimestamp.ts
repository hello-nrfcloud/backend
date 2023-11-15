export const parseDateTimeFromLogToTimestamp = (
	logString: string,
): number | null => {
	const matches = /^(?<date>[\d-]+\s[\d:,\\.]+)/.exec(logString)
	if (matches === null) return null

	const extractedDateTime = matches.groups?.date ?? ''
	const ts = Date.parse(extractedDateTime.replace(/,/, '.'))

	return isNaN(ts) ? null : ts
}
