import {
	packLayer,
	type PackedLayer,
} from '@bifravst/aws-cdk-lambda-helpers/layer'
import pJson from '../../package.json'

const dependencies: Array<keyof (typeof pJson)['dependencies']> = [
	'mqtt',
	'ws',
	'@hello.nrfcloud.com/lambda-helpers',
]

export const pack = async (): Promise<PackedLayer> =>
	packLayer({
		id: 'healthCheckLayer',
		dependencies,
		installCommand: () => [
			'npm',
			'i',
			'--force',
			'--ignore-scripts',
			'--only=prod',
			'--no-audit',
		],
	})
