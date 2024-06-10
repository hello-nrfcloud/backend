import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { shadowDiff } from './shadowDiff.js'

void describe('shadowDiff()', () => {
	void it('should not return an updated shadow, if it is already present in the shadow', () => {
		const current = {
			reported: {
				'14205:1.0': {
					'0': {
						'0': 29.47,
						'1': 24.19,
						'2': 984.3000000000001,
						'10': 26,
						'99': 1718009832863,
					},
				},
			},
		}

		const update = {
			reported: {
				'14205:1.0': {
					'0': {
						'2': 984.3000000000001,
						'99': 1718009832863,
					},
				},
			},
		}

		assert.deepEqual(shadowDiff(current, update), {})
	})

	void it('should return an updated shadow, if is not already present in the shadow', () => {
		const current = {
			reported: {
				'14205:1.0': {
					'0': {
						'0': 29.47,
						'1': 24.19,
						'2': 984.3000000000001,
						'10': 26,
						'99': 1718009832863,
					},
				},
			},
		}

		const update = {
			reported: {
				'14205:1.0': {
					'0': {
						'2': 985,
						'99': 1718009832865,
					},
				},
			},
		}

		assert.deepEqual(shadowDiff(current, update), {
			reported: {
				'14205:1.0': {
					'0': {
						'2': 985,
						'99': 1718009832865,
					},
				},
			},
		})
	})
})
