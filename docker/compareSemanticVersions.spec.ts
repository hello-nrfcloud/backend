import { compareSemanticVersions } from './compareSemanticVersions.js'

describe('compareSemanticVersions', () => {
	it('should sort semantic versions', () => {
		const versions = ['1', '1.0.0', '1.0.1', '0.0.1']

		expect(versions.sort(compareSemanticVersions)).toEqual([
			'0.0.1',
			'1',
			'1.0.0',
			'1.0.1',
		])
	})
})
