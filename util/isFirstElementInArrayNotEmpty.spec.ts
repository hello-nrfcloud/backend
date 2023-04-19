import { isFirstElementInArrayNotEmpty } from './isFirstElementInArrayNotEmpty.js'

describe('isFirstElementInArrayNotEmpty', () => {
	type TestObject = {
		a?: string
		b?: number
		c?: boolean
	}

	const validArray: TestObject[] = [
		{ a: 'hello', b: 123, c: false },
		{ b: 456, c: true },
	]

	const emptyArray: TestObject[] = []

	const invalidArray: TestObject[] = [
		{ b: 456, c: true },
		{ a: 'hello', b: 123, c: false },
	]

	it('returns true if the first element has values for all specified properties', () => {
		const result = isFirstElementInArrayNotEmpty(validArray, 'a', 'b', 'c')
		expect(result).toBe(true)
	})

	it('returns false if the first element has any specified properties are null or undefined', () => {
		const result = isFirstElementInArrayNotEmpty(invalidArray, 'a', 'b')
		expect(result).toBe(false)
	})

	it('returns false if the array is empty', () => {
		const result = isFirstElementInArrayNotEmpty(emptyArray, 'a')
		expect(result).toBe(false)
	})

	it('returns true if no properties are specified', () => {
		const result = isFirstElementInArrayNotEmpty(validArray)
		expect(result).toBe(true)
	})
})
