export const isNullOrUndefined = (arg?: unknown | undefined | null): boolean =>
	arg === undefined || arg === null

export const isNotNullOrUndefined = (arg?: unknown | null): boolean =>
	!isNullOrUndefined(arg)
