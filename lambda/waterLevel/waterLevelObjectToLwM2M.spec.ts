import { LwM2MObjectID } from '@hello.nrfcloud.com/proto-lwm2m'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { waterLevelObjectToLwM2M } from './waterLevelObjectToLwM2M'
import type { StationWaterLevel } from './getWaterLevelInfo'

describe('waterLevelObjectToLWM2M', () => {
	it('should convert locationData to LwM2M', () => {
		const locationdata: StationWaterLevel = {
			station: {
				stationCode: 'ANX',
				location: {
					lat: 69.326067,
					lng: 16.134848,
				},
			},
			waterLevel: {
				level: 108.2,
				time: new Date('2024-03-01T08:00:00.000Z'),
			},
		}
		const expectedRes = [
			{
				ObjectID: LwM2MObjectID.Geolocation_14201,
				ObjectVersion: '1.0',
				Resources: {
					'0': 69.326067,
					'1': 16.134848,
					'6': 'Fixed',
					'3': 1,
					'99': new Date('2024-03-01T08:00:00.000Z'),
				},
			},
			{
				ObjectID: LwM2MObjectID.SeaWaterLevel_14230,
				ObjectVersion: '1.0',
				Resources: {
					'0': 108.2,
					'1': 'ANX',
					'99': new Date('2024-03-01T08:00:00.000Z'),
				},
			},
		]
		assert.deepEqual(waterLevelObjectToLwM2M(locationdata), expectedRes)
	})
})
