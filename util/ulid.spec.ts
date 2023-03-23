import { ulid, ulidRegEx } from './ulid.js'

describe('ulid()', () => {
	it('should return a Ulid', () => expect(ulid()).toMatch(ulidRegEx))
	it('should not return the same Ulid', () => {
		const id1 = ulid()
		const id2 = ulid()
		expect(id1).not.toMatch(id2)
	})
})
