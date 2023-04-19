import { isNullOrUndefined } from './isNullOrUndefined.js'

export const isString = (s?: string): s is string =>
	!isNullOrUndefined(s) && typeof s === 'string'
