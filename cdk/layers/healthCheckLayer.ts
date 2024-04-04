import {
	packLayer,
	type PackedLayer,
} from '@bifravst/aws-cdk-lambda-helpers/layer'

export const pack = async (): Promise<PackedLayer> =>
	packLayer({
		id: 'healthCheckLayer',
		dependencies: ['mqtt', 'ws', '@hello.nrfcloud.com/lambda-helpers'],
	})
