import { hasValues, type AssertObject } from './hasValues'

export const isFirstElementInArrayNotEmpty = <T>(
	arr: readonly T[],
	...props: (keyof T)[]
): arr is [AssertObject<Pick<T, (typeof props)[number]>>, ...T[]] => {
	if (arr.length === 0) return false

	return arr[0] !== undefined ? hasValues(arr[0], ...props) : false
}
