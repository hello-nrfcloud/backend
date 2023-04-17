import { padVersion } from './padVersion'

describe('padVersion()', () => {
	it.each([
		['1', '1.0.0'],
		['2.0', '2.0.0'],
		['3.0.1', '3.0.1'],
	])(`should pad %s to %s`, (unpadded, padded) =>
		expect(padVersion(unpadded)).toEqual(padded),
	)
})
