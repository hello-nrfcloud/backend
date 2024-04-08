export const isNullOrUndefined = (arg?: unknown): arg is null | undefined =>
	arg === undefined || arg === null

export const isNotNullOrUndefined = (arg?: unknown): boolean =>
	!isNullOrUndefined(arg)
