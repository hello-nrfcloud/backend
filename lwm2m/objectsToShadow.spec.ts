import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { objectsToShadow } from './objectsToShadow.js'

void describe('objectsToShadow()', () => {
	void it('should convert a list of LwM2M objects to a shadow document', () =>
		assert.deepEqual(
			objectsToShadow([
				{
					ObjectID: 14205,
					Resources: {
						'0': 27.69,
						'1': 18.9,
						'2': 97.271,
						'99': new Date('2023-11-05T15:13:28.705Z'),
					},
				},
				{
					ObjectID: 14202,
					Resources: {
						'0': 99,
						'1': 4.174,
						'2': 0,
						'3': 25.9,
						'99': new Date('2023-11-05T15:13:49.276Z'),
					},
				},
				{
					ObjectID: 14203,
					Resources: {
						'0': 'LTE-M',
						'1': 20,
						'2': -93,
						'3': 2305,
						'4': 34237196,
						'5': 24202,
						'6': '100.81.95.75',
						'11': 7,
						'99': new Date('2023-11-05T15:13:28.795Z'),
					},
				},
			]),
			{
				'14205:1.0': {
					0: {
						'0': 27.69,
						'1': 18.9,
						'2': 97.271,
						'99': 1699197208705,
					},
				},
				'14203:1.0': {
					0: {
						'0': 'LTE-M',
						'1': 20,
						'2': -93,
						'3': 2305,
						'4': 34237196,
						'5': 24202,
						'6': '100.81.95.75',
						'11': 7,
						'99': 1699197208795,
					},
				},
				'14202:1.0': {
					0: {
						'0': 99,
						'1': 4.174,
						'2': 0,
						'3': 25.9,
						'99': 1699197229276,
					},
				},
			},
		))
})
