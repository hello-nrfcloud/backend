import { getDistanceFromLatLngInKm } from './getDistanceFromLatLngInKm.js'

export type Coordinate = {
	lat: number
	lng: number
	ts: number
}

export type TrailCoordinates = Coordinate & {
	count: number
}

export const createTrailOfCoordinates = (
	maxDistanceInKm: number,
	listOfCoordinates: Coordinate[],
): TrailCoordinates[] => {
	const result: TrailCoordinates[] = []
	for (const coordinate of listOfCoordinates) {
		const prev = result[result.length - 1]
		if (prev === undefined) {
			result.push({
				...coordinate,
				count: 1,
			})
		} else {
			if (
				getDistanceFromLatLngInKm({ pointA: prev, pointB: coordinate }) >
				maxDistanceInKm
			) {
				result.push({
					...coordinate,
					count: 1,
				})
			} else {
				prev.count += 1
			}
		}
	}
	return result
}
