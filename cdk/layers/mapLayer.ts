import { packLayer, type PackedLayer } from '../helpers/lambdas/packLayer.js'

export const pack = async (): Promise<PackedLayer> =>
	packLayer({
		id: 'mapLayer',
		dependencies: [
			'@nordicsemiconductor/from-env',
			'@sinclair/typebox',
			'@hello.nrfcloud.com/proto-map',
			'@hello.nrfcloud.com/proto',
			'@middy/core',
			'id128',
			'lodash-es',
			'@nordicsemiconductor/random-words',
			'@nordicsemiconductor/timestream-helpers',
			'@aws-lambda-powertools/metrics',
		],
	})
