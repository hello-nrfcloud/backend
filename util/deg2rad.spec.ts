import { deg2rad } from './deg2rad.js'

describe('deg2rad()', () => {
	it('should convert degrees to radians', () => {
		const res = Math.PI

		expect(deg2rad(180)).toEqual(res)
	})
})
