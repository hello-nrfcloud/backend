import assert from 'node:assert'
import { describe, it } from 'node:test'
import xml2js from 'xml2js'
import { convertLocationsAPIResponse } from './getLocations'

export const parser = new xml2js.Parser()

describe('getStations()', () => {
	it('should return a list of the different stations', async () => {
		const expectedRes = [
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
		const getLoc = convertLocationsAPIResponse({
			fetchAndGetStationInfo: () =>
				Promise.resolve({
					value: {
						tide: {
							stationinfo: [
								{
									location: [
										{
											$: {
												name: 'Andenes',
												code: 'ANX',
												latitude: '69.326067',
												longitude: '16.134848',
												type: 'PERM',
											},
										},
										{
											$: {
												name: 'Bergen',
												code: 'BGO',
												latitude: '60.398046',
												longitude: '5.320487',
												type: 'PERM',
											},
										},
										{
											$: {
												name: 'Bodø',
												code: 'BOO',
												latitude: '67.292330',
												longitude: '14.399770',
												type: 'PERM',
											},
										},
										{
											$: {
												name: 'Bruravik',
												code: 'BRJ',
												latitude: '60.492094',
												longitude: '6.893949',
												type: 'PERM',
											},
										},
									],
								},
							],
						},
					},
				}),
		})
		assert.deepEqual(await getLoc(), expectedRes)
	})
})
