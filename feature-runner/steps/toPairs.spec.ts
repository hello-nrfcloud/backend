import { toPairs } from './toPairs.js'

describe('toPairs', () => {
	it('should pair items', () =>
		expect(toPairs([{ a: 'foo' }, { a: 'bar' }, { a: 'baz' }])).toMatchObject([
			[{ a: 'foo' }, { a: 'bar' }],
			[{ a: 'bar' }, { a: 'baz' }],
		]))
})
