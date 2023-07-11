import { isNullOrUndefined } from './isNullOrUndefined.js'

type PartialObject<T> = {
	[K in keyof T]?: T[K]
}

export type AssertObject<T> = {
	[K in keyof T]-?: T[K]
}

export const hasValues = <T>(
	obj: T,
	...props: (keyof T)[]
): obj is PartialObject<Omit<T, (typeof props)[number]>> &
	AssertObject<Pick<T, (typeof props)[number]>> => {
	if (typeof obj === 'object' && obj !== null) {
		for (const prop of props) {
			if (isNullOrUndefined(obj[prop])) return false
		}

		return true
	}

	return false
}
