import { objectMatching, arrayContaining, is, anArray } from 'tsmatchers'
import type { Matcher } from 'tsmatchers/js/tsMatchers'

export const objectDeepMatching = (expected: unknown): Matcher<unknown> => {
	if (Array.isArray(expected)) {
		let arrayMatcher = is(anArray)
		for (const item of expected) {
			arrayMatcher = arrayMatcher.and(arrayContaining(objectDeepMatching(item)))
		}
		return arrayMatcher
	}
	if (typeof expected === 'object' && expected !== null)
		return objectMatching(
			Object.entries(expected).reduce(
				(matchers, [k, v]) => ({ ...matchers, [k]: objectDeepMatching(v) }),
				{},
			),
		)
	return expected as Matcher<unknown>
}
