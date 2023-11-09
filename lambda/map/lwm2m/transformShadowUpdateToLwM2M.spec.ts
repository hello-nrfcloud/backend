import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { transformShadowUpdateToLwM2M } from './transformShadowUpdateToLwM2M.js'
import { models } from '@hello.nrfcloud.com/proto-lwm2m'

void describe('transformShadowUpdateToLwM2M()', () => {
	void it('should convert a shadow update', async () =>
		assert.deepEqual(
			await transformShadowUpdateToLwM2M(
				models['asset_tracker_v2+AWS'].transforms,
			)({
				state: {
					reported: {
						env: {
							v: { temp: 27.07, hum: 29.261, atmp: 97.13 },
							ts: 1699202473044,
						},
						bat: { v: 4382, ts: 1699202473174 },
					},
				},
			}),
			[
				{
					ObjectID: 14202,
					Resources: { '1': 4.382, '99': new Date('2023-11-05T16:41:13.174Z') },
				},
				{
					ObjectID: 14205,
					Resources: {
						'0': 27.07,
						'1': 29.261,
						'2': 97.13,
						'99': new Date('2023-11-05T16:41:13.044Z'),
					},
				},
			],
		))
})
