import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shadowToObjects } from './shadowToObjects.js'

void describe('shadowToObjects()', () => {
	void it('should convert a shadow to LwM2M objects', () =>
		assert.deepEqual(
			shadowToObjects({
				'14205:1.0': {
					0: {
						'0': 27.63,
						'1': 19.354,
						'2': 97.465,
						'99': 1699217636982,
					},
					42: {
						'0': 25,
						'99': 1699217636982,
					},
				},
				'14203:1.0': {
					0: {
						'0': 'LTE-M',
						'1': 20,
						'2': -90,
						'3': 2305,
						'4': 34237196,
						'5': 24202,
						'6': '100.81.95.75',
						'11': 7,
						'99': 1699217637072,
					},
				},
				'14202:1.0': {
					0: {
						'0': 99,
						'1': 4.174,
						'2': 0,
						'3': 25.9,
						'99': 1699217657553,
					},
				},
			}),
			[
				{
					ObjectID: 14205,
					ObjectVersion: '1.0',
					Resources: {
						'0': 27.63,
						'1': 19.354,
						'2': 97.465,
						'99': new Date(1699217636982),
					},
				},
				{
					ObjectID: 14205,
					ObjectInstanceID: 42,
					ObjectVersion: '1.0',
					Resources: {
						'0': 25,
						'99': new Date(1699217636982),
					},
				},
				{
					ObjectID: 14203,
					ObjectVersion: '1.0',
					Resources: {
						'0': 'LTE-M',
						'1': 20,
						'2': -90,
						'3': 2305,
						'4': 34237196,
						'5': 24202,
						'6': '100.81.95.75',
						'11': 7,
						'99': new Date(1699217637072),
					},
				},
				{
					ObjectID: 14202,
					ObjectVersion: '1.0',
					Resources: {
						'0': 99,
						'1': 4.174,
						'2': 0,
						'3': 25.9,
						'99': new Date(1699217657553),
					},
				},
			],
		))
})
