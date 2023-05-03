import { ensureNumber } from './ensureNumber.js'

describe('ensureNumber', () => {
	it('should return the converted number if value is a valid number', () => {
		expect(ensureNumber(10, 0)).toBe(10)
		expect(ensureNumber('20', 0)).toBe(20)
		expect(ensureNumber(' 30 ', 0)).toBe(30)
		expect(ensureNumber(-40, 0)).toBe(-40)
		expect(ensureNumber(0.5, 0)).toBe(0.5)
	})

	it('should return the default value if value is not a valid number', () => {
		expect(ensureNumber('abc', 0)).toBe(0)
		expect(ensureNumber('5ab', 0)).toBe(0)
		expect(ensureNumber('5 ab', 0)).toBe(0)
		expect(ensureNumber(null, 100)).toBe(0) // Number converts null to 0
		expect(ensureNumber(undefined, -50)).toBe(-50)
		expect(ensureNumber({}, 0)).toBe(0)
	})
})
