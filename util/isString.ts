import { isNullOrUndefined } from './isNullOrUndefined.ts'

export const isString = (s?: string): s is string =>
	!isNullOrUndefined(s) && typeof s === 'string'
