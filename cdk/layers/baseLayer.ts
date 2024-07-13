import {
	packLayer,
	type PackedLayer,
} from '@bifravst/aws-cdk-lambda-helpers/layer'
import type pJson from '../../package.json'

const dependencies: Array<keyof (typeof pJson)['dependencies']> = [
	'@bifravst/from-env',
	'@bifravst/timestream-helpers',
	'@sinclair/typebox',
	'@hello.nrfcloud.com/proto',
	'@hello.nrfcloud.com/proto-map',
	'p-limit',
	'@aws-lambda-powertools/metrics',
	'lodash-es',
	'@middy/core',
	'@middy/input-output-logger',
	'@hello.nrfcloud.com/lambda-helpers',
	'@bifravst/aws-ssm-settings-helpers',
	'@hello.nrfcloud.com/nrfcloud-api-helpers',
	'cbor-x',
	'id128',
	'p-retry',
]

export const pack = async (): Promise<PackedLayer> =>
	packLayer({
		id: 'baseLayer',
		dependencies,
	})
