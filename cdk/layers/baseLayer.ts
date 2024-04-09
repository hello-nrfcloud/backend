import {
	packLayer,
	type PackedLayer,
} from '@bifravst/aws-cdk-lambda-helpers/layer'

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
			'@hello.nrfcloud.com/lambda-helpers',
			'@bifravst/aws-ssm-settings-helpers',
		],
	})
