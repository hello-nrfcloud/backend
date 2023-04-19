import { slashless } from './slashless.js'

describe('slashless()', () => {
	it('should remove the slash from an URL and convert it to a string', () =>
		expect(slashless(new URL('https://api.nrfcloud.com/'))).toEqual(
			'https://api.nrfcloud.com',
		))
})
