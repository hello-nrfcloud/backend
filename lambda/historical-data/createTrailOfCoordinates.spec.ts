import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createTrailOfCoordinates } from './createTrailOfCoordinates.js'

const coordinates = [
	{
		lat: 63.422214376965165,
		lng: 10.43763831347703,
		ts: 1691114567,
	},
	{
		lat: 63.422214376965165,
		lng: 10.43763831347703,
		ts: 1691114667,
	},
	{
		lat: 63.42161345025134,
		lng: 10.436310829032905,
		ts: 1691114687,
	},
	{
		lat: 63.42161345025134,
		lng: 10.436310829032905,
		ts: 1691114807,
	},
	{
		lat: 63.42161345025134,
		lng: 10.436310829032905,
		ts: 1691114987,
	},
	{
		lat: 63.42161345025134,
		lng: 10.436310829032905,
		ts: 1691115087,
	},
	{
		lat: 63.42154475460784,
		lng: 10.43729416236437,
		ts: 1691115187,
	},
	{
		lat: 63.42135082023726,
		lng: 10.436949061903944,
		ts: 1691115287,
	},

	{
		lat: 63.42130758628152,
		lng: 10.436780652879253,
		ts: 1691115387,
	},
	{
		lat: 63.42130758628152,
		lng: 10.436780652879253,
		ts: 1691115487,
	},
	{
		lat: 63.42130758628152,
		lng: 10.436780652879253,
		ts: 1691115587,
	},
	{
		lat: 63.42130758628152,
		lng: 10.436780652879253,
		ts: 1691115687,
	},
	{
		lat: 63.42130758628152,
		lng: 10.436780652879253,
		ts: 1691115787,
	},
	{
		lat: 63.421482406605705,
		lng: 10.437975967525364,
		ts: 1691115887,
	},
	{
		lat: 63.421482406605705,
		lng: 10.437975967525364,
		ts: 1691115987,
	},
]

void describe('createTrailOfCoordinates()', () => {
	void it('should return an empty list if no coordinate given', () =>
		assert.equal(createTrailOfCoordinates(1, []).length, 0))
	void it('should return the coordinate if only one coordinate is given', () => {
		assert.deepEqual(
			createTrailOfCoordinates(1, [
				{
					lat: 63.422214376965165,
					lng: 10.43763831347703,
					ts: 1691114567,
					source: 'GNSS',
				},
			]),
			[
				{
					lat: 63.422214376965165,
					lng: 10.43763831347703,
					ts: 1691114567,
					count: 1,
					radiusKm: 0,
					sources: new Set(['GNSS']),
				},
			],
		)
	})
	void it('should return two coordinates if the distance between them is above 1km', () => {
		assert.deepEqual(
			createTrailOfCoordinates(1, [
				{
					lat: 63.422214376965165,
					lng: 10.43763831347703,
					ts: 1691114567,
					source: 'GNSS',
				},
				{
					lat: 63.36316007133849,
					lng: 10.355729671057269,
					ts: 1691114567,
					source: 'GNSS',
				},
			]),
			[
				{
					lat: 63.422214376965165,
					lng: 10.43763831347703,
					ts: 1691114567,
					count: 1,
					radiusKm: 0,
					sources: new Set(['GNSS']),
				},
				{
					lat: 63.36316007133849,
					lng: 10.355729671057269,
					ts: 1691114567,
					count: 1,
					radiusKm: 0,
					sources: new Set(['GNSS']),
				},
			],
		)
	})
	void it('should only return one counted coordinate if the distance is less than 1km', () => {
		assert.deepEqual(
			createTrailOfCoordinates(1, [
				{
					lat: 63.422214376965165,
					lng: 10.43763831347703,
					ts: 1691114567,
					source: 'GNSS',
				},
				{
					lat: 63.422214376965165,
					lng: 10.43763831347703,
					ts: 1691114667,
					source: 'WIFI',
				},
			]),
			[
				{
					lat: 63.422214376965165,
					lng: 10.43763831347703,
					ts: 1691114567,
					count: 2,
					radiusKm: 0,
					sources: new Set(['GNSS', 'WIFI']),
				},
			],
		)
	})
	void it('should return counted coordinates with a distance > 50 meters, and ignore coordinates with smaller distance. Every coordinate should be counted.', () => {
		const expectedResults50m = [
			{
				lat: 63.422214376965165,
				lng: 10.43763831347703,
				ts: 1691114567,
				count: 2,
				radiusKm: 0,
				sources: new Set(['GNSS']),
			},
			{
				lat: 63.42161345025134,
				lng: 10.436310829032905,
				ts: 1691114687,
				count: 11,
				radiusKm: 0.049514654728146604,
				sources: new Set(['GNSS']),
			},
			{
				lat: 63.421482406605705,
				lng: 10.437975967525364,
				ts: 1691115887,
				count: 2,
				radiusKm: 0,
				sources: new Set(['GNSS']),
			},
		]

		assert.deepEqual(
			createTrailOfCoordinates(
				0.05,
				coordinates.map((c) => ({ ...c, source: 'GNSS' })),
			),
			expectedResults50m,
		)
	})

	void it('should return coordinates with a distance > 1 meter, and ignore coordinates with smaller distance. Every coordinate should be counted.', () => {
		const expectedResults1m = [
			{
				lat: 63.422214376965165,
				lng: 10.43763831347703,
				ts: 1691114567,
				count: 2,
				radiusKm: 0,
				sources: new Set(['GNSS']),
			},
			{
				lat: 63.42161345025134,
				lng: 10.436310829032905,
				ts: 1691114687,
				count: 4,
				radiusKm: 0,
				sources: new Set(['GNSS']),
			},
			{
				lat: 63.42154475460784,
				lng: 10.43729416236437,
				ts: 1691115187,
				count: 1,
				radiusKm: 0,
				sources: new Set(['GNSS']),
			},
			{
				lat: 63.42135082023726,
				lng: 10.436949061903944,
				ts: 1691115287,
				count: 1,
				radiusKm: 0,
				sources: new Set(['GNSS']),
			},
			{
				lat: 63.42130758628152,
				lng: 10.436780652879253,
				ts: 1691115387,
				count: 5,
				radiusKm: 0,
				sources: new Set(['GNSS']),
			},

			{
				lat: 63.421482406605705,
				lng: 10.437975967525364,
				ts: 1691115887,
				count: 2,
				radiusKm: 0,
				sources: new Set(['GNSS']),
			},
		]
		assert.deepEqual(
			createTrailOfCoordinates(
				0.0001,
				coordinates.map((c) => ({ ...c, source: 'GNSS' })),
			),
			expectedResults1m,
		)
	})
	void it('should return coordinates with a distance > 1 km, and ignore coordinates with smaller distance. Every coordinates should be counted.', () => {
		const expectedResults1Km = [
			{
				lat: 63.422214376965165,
				lng: 10.43763831347703,
				ts: 1691114567,
				radiusKm: 0.10948726763782791,
				count: 15,
				sources: new Set(['GNSS']),
			},
		]
		assert.deepEqual(
			createTrailOfCoordinates(
				1,
				coordinates.map((c) => ({ ...c, source: 'GNSS' })),
			),
			expectedResults1Km,
		)
	})
	void it('should return coordinates with a distance > 1 km and count all positions even if the function only gets one coordinate', () => {
		const oneCoordinate = [
			{
				lat: 63.422214376965165,
				lng: 10.43763831347703,
				ts: 1691114567,
				source: 'GNSS',
			},
			{
				lat: 63.422214376965165,
				lng: 10.43763831347703,
				ts: 1691114567,
				source: 'GNSS',
			},
			{
				lat: 63.422214376965165,
				lng: 10.43763831347703,
				ts: 1691114567,
				source: 'GNSS',
			},
		]

		const expectedResults1coordinate = [
			{
				lat: 63.422214376965165,
				lng: 10.43763831347703,
				ts: 1691114567,
				count: 3,
				radiusKm: 0,
				sources: new Set(['GNSS']),
			},
		]
		assert.deepEqual(
			createTrailOfCoordinates(
				1,
				oneCoordinate.map((c) => ({ ...c, source: 'GNSS' })),
			),
			expectedResults1coordinate,
		)
	})
})
