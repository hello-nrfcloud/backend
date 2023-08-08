import { getDistanceFromLatLngInKm } from './getDistanceFromLatLngInKm.js'

export type Coordinate = {
	lat: number
	lng: number
	ts: number
}

export type TrailCoordinates = Coordinate & {
	count: number
	radiusKm: number
}

export const createTrailOfCoordinates = (
	maxDistanceKm: number,
	listOfCoordinates: Coordinate[],
): TrailCoordinates[] => {
	const result: TrailCoordinates[] = []
	for (const coordinate of listOfCoordinates.sort(
		({ ts: t1 }, { ts: t2 }) => t1 - t2,
	)) {
		const prev = result[result.length - 1]
		if (prev === undefined) {
			result.push({
				...coordinate,
				count: 1,
				radiusKm: 0,
			})
		} else {
			const distance = getDistanceFromLatLngInKm({
				pointA: prev,
				pointB: coordinate,
			})
			if (distance > maxDistanceKm) {
				result.push({
					...coordinate,
					count: 1,
					radiusKm: 0,
				})
			} else {
				prev.count += 1
				prev.radiusKm = Math.max(prev.radiusKm, distance)
			}
		}
	}
	return result
}
