import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { transformMessageToLwM2M } from './transformMessageToLwM2M.js'
import {
	models,
	LwM2MObjectID,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-map'

void describe('transformMessageToLwM2M()', () => {
	void it('should convert a shadow update', async () => {
		const expected: LwM2MObjectInstance = {
			ObjectID: LwM2MObjectID.Environment_14205,
			Resources: {
				0: 15.5,
				99: new Date(1699564330376),
			},
		}
		assert.deepEqual(
			await transformMessageToLwM2M(models['PCA20035+solar'].transforms)({
				appId: 'TEMP',
				messageType: 'DATA',
				ts: 1699564330376,
				data: '15.5',
			}),
			[expected],
		)
	})
})
