import {
	packLayer,
	type PackedLayer,
} from '@bifravst/aws-cdk-lambda-helpers/layer'
import type pJson from '../../package.json'

const dependencies: Array<keyof (typeof pJson)['dependencies']> = [
	'jsonwebtoken',
]

export const pack = async (): Promise<PackedLayer> =>
	packLayer({
		id: 'jwtLayer',
		dependencies,
	})
