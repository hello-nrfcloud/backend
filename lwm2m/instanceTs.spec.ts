import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { instanceTs } from './instanceTs.js'

void describe('instanceTs()', () => {
	void it('should return the timestamp of the instance', () =>
		assert.equal(
			instanceTs({
				ObjectID: 14210,
				ObjectVersion: '1.0',
				Resources: {
					'0': 3.5399999618530273,
					'1': 4.168000221252441,
					'99': '2024-02-23T10:18:20.474Z',
				},
			}).getTime(),
			new Date('2024-02-23T10:18:20.474Z').getTime(),
		))
})
