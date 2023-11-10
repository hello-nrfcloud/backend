import { mock } from 'node:test'
import { arrayContaining, check, objectMatching } from 'tsmatchers'

export const assertCall = (
	mockFn: ReturnType<(typeof mock)['fn']>,
	args: Record<string, unknown>,
	callNumber: number = 0,
): void => {
	check(mockFn.mock.calls[callNumber]?.arguments).is(
		arrayContaining(objectMatching(args)),
	)
}
