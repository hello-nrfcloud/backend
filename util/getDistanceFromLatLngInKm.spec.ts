import { getDistanceFromLatLngInKm } from './getDistanceFromLatLngInKm.js'

describe('getDistanceFromLatLngInKm()', () => {
	it('should calculate the distance between two coordinates in km.', () => {
		const pointA = {
			lat: 63.422214376965165,
			lng: 10.43763831347703,
			ts: 1691114567,
		}
		const pointB = {
			lat: 59.92117247790821,
			lng: 10.688614657210739,
			ts: 1691114667,
		}
		expect(getDistanceFromLatLngInKm({ pointA, pointB })).toEqual(
			389.52247455218924,
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
