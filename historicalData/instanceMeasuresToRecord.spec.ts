import { LwM2MObjectID } from '@hello.nrfcloud.com/proto-map/lwm2m'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { InvalidTimeError } from '../lwm2m/InvalidTimeError.js'
import { instanceMeasuresToRecord } from './instanceMeasuresToRecord.js'
import { NoHistoryMeasuresError } from './NoHistoryMeasuresError.js'

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

	void it('should return an error if the timestamp is invalid', () => {
		const res = instanceMeasuresToRecord({
			ObjectID: LwM2MObjectID.Environment_14205,
			Resources: {
				'0': 13.8,
				'99': 1718878270596,
			},
		})
		assert.equal('error' in res && res.error instanceof InvalidTimeError, true)
	})
})
