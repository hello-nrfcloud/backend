import { getDistanceFromLatLngInKm } from './getDistanceFromLatLngInKm.js'

describe('getDistanceFromLatLngInKm()', () => {
	it('should calculate the distance between two coordinates in km.', () => {
		const pointA = {
			lat: 63.422214376965165,
			lng: 10.43763831347703,
			ts: 1691114567,
		}

		const pointB = {
			lat: 63.42161345025134,
			lng: 10.436310829032905,
			ts: 1691114667,
		}
		expect(getDistanceFromLatLngInKm({ pointA, pointB })).toEqual(
			0.0939499540663425,
		)
	})
	it('should return 0 if the coordinate is the same', () => {
		const pointA = {
			lat: 63.422214376965165,
			lng: 10.43763831347703,
			ts: 1691114567,
		}
		const pointB = {
			lat: 63.422214376965165,
			lng: 10.43763831347703,
			ts: 1691114577,
		}
		expect(getDistanceFromLatLngInKm({ pointA, pointB })).toEqual(0)
	})
})
