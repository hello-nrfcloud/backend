import { convertMessageToTimestreamRecords } from './convertMessageToTimestreamRecords.js'

describe('convertMessageToTimestreamRecords', () => {
	it('should convert a gain message to Timestream records', () => {
		const context =
			'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain'

		expect(
			convertMessageToTimestreamRecords({
				'@context': context,
				mA: 100,
				ts: 1606474470069,
			}),
		).toEqual([
			{
				Dimensions: [
					{
						Name: '@context',
						Value: context,
					},
				],
				MeasureName: 'mA',
				MeasureValue: '100',
				MeasureValueType: 'DOUBLE',
				Time: '1606474470069',
				TimeUnit: 'MILLISECONDS',
			},
		])
	})

	it('should convert a voltage message to Timestream records', () => {
		const context =
			'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/voltage'

		expect(
			convertMessageToTimestreamRecords({
				'@context': context,
				v: 3.4,
				ts: 1606474470069,
			}),
		).toEqual([
			{
				Dimensions: [
					{
						Name: '@context',
						Value: context,
					},
				],
				MeasureName: 'v',
				MeasureValue: '3.4',
				MeasureValueType: 'DOUBLE',
				Time: '1606474470069',
				TimeUnit: 'MILLISECONDS',
			},
		])
	})

	it('should convert a rsrp message to Timestream records', () => {
		const context =
			'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/rsrp'

		expect(
			convertMessageToTimestreamRecords({
				'@context': context,
				rsrp: -30.0,
				ts: 1606474470069,
			}),
		).toEqual([
			{
				Dimensions: [
					{
						Name: '@context',
						Value: context,
					},
				],
				MeasureName: 'rsrp',
				MeasureValue: '-30',
				MeasureValueType: 'DOUBLE',
				Time: '1606474470069',
				TimeUnit: 'MILLISECONDS',
			},
		])
	})

	it('should convert a humidity message to Timestream records', () => {
		const context =
			'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/humid'

		expect(
			convertMessageToTimestreamRecords({
				'@context': context,
				p: 70.0,
				ts: 1606474470069,
			}),
		).toEqual([
			{
				Dimensions: [
					{
						Name: '@context',
						Value: context,
					},
				],
				MeasureName: 'p',
				MeasureValue: '70',
				MeasureValueType: 'DOUBLE',
				Time: '1606474470069',
				TimeUnit: 'MILLISECONDS',
			},
		])
	})

	it('should convert a temperature message to Timestream records', () => {
		const context =
			'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/temp'

		expect(
			convertMessageToTimestreamRecords({
				'@context': context,
				c: 25,
				ts: 1606474470069,
			}),
		).toEqual([
			{
				Dimensions: [
					{
						Name: '@context',
						Value: context,
					},
				],
				MeasureName: 'c',
				MeasureValue: '25',
				MeasureValueType: 'DOUBLE',
				Time: '1606474470069',
				TimeUnit: 'MILLISECONDS',
			},
		])
	})

	it('should convert a air quality message to Timestream records', () => {
		const context =
			'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/air_qual'

		expect(
			convertMessageToTimestreamRecords({
				'@context': context,
				IAQ: 200,
				ts: 1606474470069,
			}),
		).toEqual([
			{
				Dimensions: [
					{
						Name: '@context',
						Value: context,
					},
				],
				MeasureName: 'IAQ',
				MeasureValue: '200',
				MeasureValueType: 'DOUBLE',
				Time: '1606474470069',
				TimeUnit: 'MILLISECONDS',
			},
		])
	})

	it('should convert a air pressure message to Timestream records', () => {
		const context =
			'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/air_press'

		expect(
			convertMessageToTimestreamRecords({
				'@context': context,
				kPa: 110000.0,
				ts: 1606474470069,
			}),
		).toEqual([
			{
				Dimensions: [
					{
						Name: '@context',
						Value: context,
					},
				],
				MeasureName: 'kPa',
				MeasureValue: '110000',
				MeasureValueType: 'DOUBLE',
				Time: '1606474470069',
				TimeUnit: 'MILLISECONDS',
			},
		])
	})

	it('should convert a location message to Timestream records', () => {
		const context = 'https://github.com/hello-nrfcloud/backend/device-location'
		const Dimensions = [
			{
				Name: '@context',
				Value: context,
			},
		]

		expect(
			convertMessageToTimestreamRecords({
				'@context': context,
				ts: 1681985385063,
				lat: 45.524098,
				lng: -122.688408,
				acc: 200,
			}),
		).toEqual([
			{
				Dimensions,
				MeasureName: 'lat',
				MeasureValue: '45.524098',
				MeasureValueType: 'DOUBLE',
				Time: '1681985385063',
				TimeUnit: 'MILLISECONDS',
			},
			{
				Dimensions,
				MeasureName: 'lng',
				MeasureValue: '-122.688408',
				MeasureValueType: 'DOUBLE',
				Time: '1681985385063',
				TimeUnit: 'MILLISECONDS',
			},
			{
				Dimensions,
				MeasureName: 'acc',
				MeasureValue: '200',
				MeasureValueType: 'DOUBLE',
				Time: '1681985385063',
				TimeUnit: 'MILLISECONDS',
			},
		])
	})

	it('should convert a unknown message having numeric value to Timestream records', () => {
		const context =
			'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/new'

		expect(
			convertMessageToTimestreamRecords({
				'@context': context,
				x: 9,
				ts: 1606474470069,
			}),
		).toEqual([
			{
				Dimensions: [
					{
						Name: '@context',
						Value: context,
					},
				],
				MeasureName: 'x',
				MeasureValue: '9',
				MeasureValueType: 'DOUBLE',
				Time: '1606474470069',
				TimeUnit: 'MILLISECONDS',
			},
		])
	})

	it('should ignore non-numeric value to Timestream records', () => {
		const context =
			'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/new'
		const Dimensions = [
			{
				Name: '@context',
				Value: context,
			},
		]
		expect(
			convertMessageToTimestreamRecords({
				'@context': context,
				x: 9,
				y: 'string',
				ts: 1606474470069,
			}),
		).toEqual([
			{
				Dimensions,
				MeasureName: 'x',
				MeasureValue: '9',
				MeasureValueType: 'DOUBLE',
				Time: '1606474470069',
				TimeUnit: 'MILLISECONDS',
			},
		])

		expect(
			convertMessageToTimestreamRecords({
				'@context': context,
				x: 9,
				y: 'string',
				z: 10,
				ts: 1606474470069,
			}),
		).toEqual([
			{
				Dimensions,
				MeasureName: 'x',
				MeasureValue: '9',
				MeasureValueType: 'DOUBLE',
				Time: '1606474470069',
				TimeUnit: 'MILLISECONDS',
			},
			{
				Dimensions,
				MeasureName: 'z',
				MeasureValue: '10',
				MeasureValueType: 'DOUBLE',
				Time: '1606474470069',
				TimeUnit: 'MILLISECONDS',
			},
		])
	})

	it('should ignore non-complied message', () => {
		expect(
			convertMessageToTimestreamRecords({
				'@context':
					'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/new',
				x: 'string',
				y: 'string',
				ts: 1606474470069,
			}),
		).toEqual([])
	})
})
