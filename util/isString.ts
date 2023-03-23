import { isNullOrUndefined } from './isNullOrUndefined'

export const isString = (s?: string): s is string =>
	!isNullOrUndefined(s) && typeof s === 'string'
