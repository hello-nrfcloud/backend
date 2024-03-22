import assert from 'node:assert'
import { describe, it } from 'node:test'
import { getFetchIntervalForAPI } from './getFetchInterval'

describe('getFetchInterval', () => {
	it('should return a fetch interval of one hour back in time.', () => {
		const expectedRes = { from: '2024-03-15T12:27', to: '2024-03-15T13:27' }
		//Fri Mar 15 2024 13:27:17 GMT+0100
		assert.deepEqual(
			getFetchIntervalForAPI(new Date(1710505637000)),
			expectedRes,
		)
	})
})
