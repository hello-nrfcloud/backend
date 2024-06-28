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
						'99': 1718009832,
					},
				},
			},
		}

		const update = {
			reported: {
				'14205:1.0': {
					'0': {
						'2': 984.3000000000001,
						'99': 1718009832,
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
						'99': 1718009832,
					},
				},
			},
		}

		const update = {
			reported: {
				'14205:1.0': {
					'0': {
						'2': 985,
						'99': 1718009833,
					},
				},
			},
		}

		assert.deepEqual(shadowDiff(current, update), {
			reported: {
				'14205:1.0': {
					'0': {
						'2': 985,
						'99': 1718009833,
					},
				},
			},
		})
	})

	void it('should not overwrite the timestamp if the updated data is older', () => {
		const current = {
			reported: {
				'14203:1.0': {
					0: {
						'11': 7,
						'99': 1718009833,
					},
				},
			},
		}

		const update = {
			reported: {
				'14203:1.0': {
					'0': {
						'0': 'LTE-M',
						'99': 1699197229,
					},
				},
			},
		}

		assert.deepEqual(shadowDiff(current, update), {
			reported: {
				'14203:1.0': {
					'0': {
						'0': 'LTE-M',
					},
				},
			},
		})
	})
})
