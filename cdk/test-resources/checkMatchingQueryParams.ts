type Logger = {
	debug: (...arg: any) => void
}
const matchRegex = /^\/(?<re>.+)\/(?<option>[gi])?$/

export const checkMatchingQueryParams = (
	actual: Record<string, unknown> | null,
	expected: Record<string, unknown>,
	log?: Logger,
): boolean => {
	log?.debug('checkMatchingQueryParams', { actual, expected })
	if (actual === null) return false

	// Check whether expected query parameters is subset of actual query parameters
	for (const prop in expected) {
		const expectedValue = expected[prop]
		const actualValue = actual?.[prop]
		if (actualValue === undefined) return false

		if (typeof expectedValue === 'string') {
			const match = matchRegex.exec(expectedValue)
			if (match !== null) {
				log?.debug('Compare using regex', { expectedValue })
				// Expect is regex
				const check = new RegExp(
					match?.groups?.re ?? '',
					match?.groups?.option,
				).test(String(actualValue))
				if (check === false) return false
			} else {
				if (actualValue !== expectedValue) return false
			}
		} else {
			// All query parameters are string
			if (actualValue !== String(expectedValue)) return false
		}
	}

	return true
}
