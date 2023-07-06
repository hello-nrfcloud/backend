import { hashSHA1 } from './hashSHA1.js'

describe('hashSHA1', () => {
	it('should return the SHA-1 hash of the input string', () => {
		expect(hashSHA1('Hello, World!')).toEqual(
			'0a0a9f2a6772942557ab5355d76af442f8f65e01',
		)
	})

	it('should return an empty string if the input is empty', () => {
		expect(hashSHA1('')).toEqual('da39a3ee5e6b4b0d3255bfef95601890afd80709')
	})
})
