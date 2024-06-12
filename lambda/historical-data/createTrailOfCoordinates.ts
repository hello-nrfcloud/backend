import { getDistanceFromLatLngInKm } from './getDistanceFromLatLngInKm.js'

export type Coordinate = {
	lat: number
	lng: number
	ts: number
}

export type TrailCoordinates = Coordinate & {
	count: number
	radiusKm: number
	sources: Set<string>
}

export const createTrailOfCoordinates = (
	/**
	 * The minimum distance in KM for a location to not be folded into the current position.
	 */
	minDistanceKm: number,
	listOfCoordinates: Array<
		Coordinate & {
			source: string
		}
	>,
): Array<TrailCoordinates> => {
	const result: Array<TrailCoordinates> = []
	for (const coordinate of listOfCoordinates.sort(
		({ ts: t1 }, { ts: t2 }) => t1 - t2,
	)) {
		const prev = result[result.length - 1]
		const { lat, lng, ts } = coordinate
		if (prev === undefined) {
			result.push({
				lat,
				lng,
				ts,
				count: 1,
				radiusKm: 0,
				sources: new Set([coordinate.source]),
			})
		} else {
			const distance = getDistanceFromLatLngInKm({
				pointA: prev,
				pointB: coordinate,
			})
			if (distance > minDistanceKm) {
				result.push({
					lat,
					lng,
					ts,
					count: 1,
					radiusKm: 0,
					sources: new Set([coordinate.source]),
				})
			} else {
				prev.count += 1
				prev.radiusKm = Math.max(prev.radiusKm, distance)
				prev.sources.add(coordinate.source)
			}
		}
	}
	return result
}
