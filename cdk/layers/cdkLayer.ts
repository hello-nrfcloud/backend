import {
	packLayer,
	type PackedLayer,
} from '@bifravst/aws-cdk-lambda-helpers/layer'
import pJson from '../../package.json' with { type: 'json' }

const dependencies: Array<keyof (typeof pJson)['devDependencies']> = [
	'cfn-response',
]

export const pack = async (): Promise<PackedLayer> =>
	packLayer({
		id: 'cdkLayer',
		dependencies,
	})
