import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
	getWaterLevelMeasurements,
	type StationWaterLevel,
} from './getWaterLevelInfo'
import parsedApiResponseWaterLevel from './testData/parsedApiResponseWaterLevel.json'

describe('getWaterLevelInfo()', () => {
	it('should return a list with waterlevelinfo from the different stations', async () => {
		const res: Array<StationWaterLevel> = [
			{
				stationCode: 'ANX',
				latitude: 69.326067,
				longitude: 16.134848,
				waterLevel: 108.2,
				time: new Date('2024-03-01T09:00:00+01:00'),
			},
			{
				stationCode: 'BGO',
				latitude: 60.398046,
				longitude: 5.320487,
				waterLevel: 82.8,
				time: new Date('2024-03-01T09:00:00+01:00'),
			},
			{
				stationCode: 'BOO',
				latitude: 67.29233,
				longitude: 14.39977,
				waterLevel: 124.9,
				time: new Date('2024-03-01T09:00:00+01:00'),
			},
			{
				stationCode: 'BRJ',
				latitude: 60.492094,
				longitude: 6.893949,
				waterLevel: 85.8,
				time: new Date('2024-03-01T09:00:00+01:00'),
			},
		]

		const stations = [
			{
				location: ['69.326067', '16.134848'],
				stationCode: 'ANX',
			},
			{
				location: ['60.398046', '5.320487'],
				stationCode: 'BGO',
			},
			{
				location: ['67.292330', '14.399770'],
				stationCode: 'BOO',
			},
			{
				location: ['60.492094', '6.893949'],
				stationCode: 'BRJ',
			},
		]
		const getWaterLevels = getWaterLevelMeasurements({
			getWaterLevelsForStation: async () =>
				Promise.resolve(parsedApiResponseWaterLevel),
		})
		//api.sehavniva.no/tideapi.php?tide_request=locationdata&lat=${station.location?.[0]}&lon=${station.location?.[1]}&datatype=OBS&lang=en&place=&dst=1&refcode=CD&fromtime=${from}&totime=${to}&interval=10
		assert.deepEqual(await getWaterLevels(stations), res)
	})
})
