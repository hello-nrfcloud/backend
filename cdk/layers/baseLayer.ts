import { packLayer, type PackedLayer } from '../helpers/lambdas/packLayer.js'

export const pack = async (): Promise<PackedLayer> =>
	packLayer({
		id: 'baseLayer',
		dependencies: [
			'@nordicsemiconductor/from-env',
			'@nordicsemiconductor/timestream-helpers',
			'@sinclair/typebox',
			'@hello.nrfcloud.com/proto',
			'p-limit',
			'@aws-lambda-powertools/metrics',
			'lodash-es',
			'@middy/core',
		],
	})
