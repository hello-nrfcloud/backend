import {
	packLayer,
	type PackedLayer,
} from '@bifravst/aws-cdk-lambda-helpers/layer'
import pJson from '../../package.json'

const dependencies: Array<keyof (typeof pJson)['dependencies']> = [
	'mqtt',
	'ws',
	'@hello.nrfcloud.com/lambda-helpers',
	'cbor-x',
]

export const pack = async (): Promise<PackedLayer> =>
	packLayer({
		id: 'healthCheckLayer',
		dependencies,
	})
