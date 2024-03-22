import type { Static } from '@sinclair/typebox'
import type { stationInfo } from './fetchAndParseXML'
import type { Station } from './Station'

export const convertLocationsAPIResponse = (
	data: Static<typeof stationInfo>,
): Array<Station> | { error: Error } => {
	const locations = []
	for (const station of data.tide.stationinfo[0]?.location ?? []) {
		locations.push({
			stationCode: station.$.code,
			location: {
				lat: station.$.latitude,
				lng: station.$.longitude,
			},
		})
	}
	if (locations.length === 0) return { error: new Error('No locations found.') }
	return locations
}
