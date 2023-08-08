import type { Coordinate } from './createTrailOfCoordinates.js'
import { deg2rad } from './deg2rad.js'

export const getDistanceFromLatLngInKm = ({
	pointA,
	pointB,
}: {
	pointA: Coordinate
	pointB: Coordinate
}): number => {
	const earthRadius = 6371
	const distLat = deg2rad(pointB.lat - pointA.lat)
	const distLng = deg2rad(pointB.lng - pointA.lng)
	const a =
		Math.sin(distLat / 2) * Math.sin(distLat / 2) +
		Math.cos(deg2rad(pointA.lat)) *
			Math.cos(deg2rad(pointB.lat)) *
			Math.sin(distLng / 2) *
			Math.sin(distLng / 2)
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
	const dist = earthRadius * c
	return dist
}
