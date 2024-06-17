import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
	NoHistoryMeasuresError,
	instanceMeasuresToRecord,
} from './instanceMeasuresToRecord.js'
import { LwM2MObjectID } from '@hello.nrfcloud.com/proto-map/lwm2m'

void describe('instanceMeasuresToRecord()', () => {
	void it('should return an error if no measures are found', () => {
		const res = instanceMeasuresToRecord({
			ObjectID: LwM2MObjectID.DeviceInformation_14204,
			Resources: {
				'0': '352656108602296',
				'1': '89457387300008502299',
				'2': 'mfw_nrf9160_1.3.5',
				'3': 'v1.3.1+thingy91.sol.lp.mmflt',
				'4': 'thingy91_nrf9160',
				'99': 1717419305,
			},
		})
		assert.equal(
			'error' in res && res.error instanceof NoHistoryMeasuresError,
			true,
		)
	})
})
