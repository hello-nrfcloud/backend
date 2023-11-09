import { App, Stack, aws_lambda as Lambda } from 'aws-cdk-lib'
import { PublicDevices } from '../resources/map/PublicDevices.js'
import type { PackedLayer } from '../helpers/lambdas/packLayer.js'
import { LambdaSource } from '../resources/LambdaSource.js'
import type { BackendLambdas } from '../BackendLambdas.js'
import { MAP_STACK_NAME } from './stackConfig.js'

/**
 * Provides resources for hello.nrfcloud.com/map
 */
export class MapStack extends Stack {
	constructor(
		parent: App,
		{
			layer,
			lambdaSources,
		}: {
			layer: PackedLayer
			lambdaSources: BackendLambdas
		},
	) {
		super(parent, MAP_STACK_NAME)

		const mapLayer = new Lambda.LayerVersion(this, 'mapLayer', {
			code: new LambdaSource(this, {
				id: 'basmapLayereLayer',
				zipFile: layer.layerZipFile,
				hash: layer.hash,
			}).code,
			compatibleArchitectures: [Lambda.Architecture.ARM_64],
			compatibleRuntimes: [Lambda.Runtime.NODEJS_18_X],
		})

		new PublicDevices(this, {
			mapLayer,
			lambdaSources,
		})
	}
}
