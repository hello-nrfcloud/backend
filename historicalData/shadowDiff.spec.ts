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

	void it('should not return a diff only the timestamp has changed', () => {
		const update = {
			reported: {
				'14203:1.0': {
					'0': {
						'0': 'LTE-M GPS',
						'1': 3,
						'3': 2801,
						'4': 31066133,
						'5': 24202,
						'6': '10.94.122.198',
						'99': 1720087757,
					},
				},
			},
		}
		const state = {
			reported: {
				'14203:1.0': {
					'0': {
						'0': 'LTE-M GPS',
						'1': 3,
						'2': -92,
						'3': 2801,
						'4': 31066133,
						'5': 24202,
						'6': '10.94.122.198',
						'11': 7,
						'99': 1720087758,
					},
				},
			},
		}

		assert.deepEqual(shadowDiff(state, update), {})
	})

	void it('should not return a diff on array changes', () => {
		const update = {
			reported: {
				'14401:1.0': {
					'0': {
						'0': ['BOOT', 'MODEM', 'APP', 'MDM_FULL'],
						'99': 1720087757,
					},
				},
			},
		}
		const state = {
			reported: {
				'14401:1.0': {
					'0': {
						'0': ['BOOT', 'MODEM', 'APP', 'MDM_FULL'],
						'99': 1720087757,
					},
				},
			},
		}

		assert.deepEqual(shadowDiff(state, update), {})
	})
})
