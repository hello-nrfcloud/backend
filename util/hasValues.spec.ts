import { hasValues } from './hasValues'

describe('hasValues', () => {
	type TestObject = {
		a?: string
		b?: number
		c?: boolean
	}

	const testObject: TestObject = {
		a: 'hello',
		b: 123,
	}

	it('returns true if all specified properties have values', () => {
		const result = hasValues(testObject, 'a', 'b')
		expect(result).toBe(true)
	})

	it('returns false if any specified properties are null or undefined', () => {
		const result = hasValues(testObject, 'a', 'b', 'c')
		expect(result).toBe(false)
	})

	it('returns true if no properties are specified', () => {
		const result = hasValues(testObject)
		expect(result).toBe(true)
	})
})
