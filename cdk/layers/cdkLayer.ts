import {
	packLayer,
	type PackedLayer,
} from '@bifravst/aws-cdk-lambda-helpers/layer'
import type pJson from '../../package.json'

const dependencies: Array<keyof (typeof pJson)['devDependencies']> = [
	'cfn-response',
]

export const pack = async (): Promise<PackedLayer> =>
	packLayer({
		id: 'cdkLayer',
		dependencies,
	})
