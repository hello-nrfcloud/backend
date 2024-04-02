export const parseDateTimeFromLog = (logString: string): Date | null => {
	const matches = /^(?<date>[\d-]+\s[\d:,\\.]+)/.exec(logString)
	if (matches === null) return null

	const extractedDateTime = matches.groups?.date ?? ''
	try {
		return new Date(extractedDateTime.replace(/,/, '.'))
	} catch {
		return null
	}
}
