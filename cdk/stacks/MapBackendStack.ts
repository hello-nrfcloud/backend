import { App, CfnOutput, aws_lambda as Lambda, Stack } from 'aws-cdk-lib'
import type { MapBackendLambdas } from '../MapBackendLambdas.js'
import type { PackedLayer } from '../helpers/lambdas/packLayer.js'
import { LambdaSource } from '../resources/LambdaSource.js'
import { ConnectionInformationGeoLocation } from '../resources/map/ConnectionInformationGeoLocation.js'
import { LwM2MShadow } from '../resources/map/LwM2MShadow.js'
import { PublicDevices } from '../resources/map/PublicDevices.js'
import { ShareAPI } from '../resources/map/ShareAPI.js'
import { MAP_BACKEND_STACK_NAME } from './stackConfig.js'
import { DevicesAPI } from '../resources/map/DevicesAPI.js'

/**
 * Provides resources for the backend serving data to hello.nrfcloud.com/map
 */
export class MapBackendStack extends Stack {
	constructor(
		parent: App,
		{
			layer,
			lambdaSources,
		}: {
			layer: PackedLayer
			lambdaSources: MapBackendLambdas
		},
	) {
		super(parent, MAP_BACKEND_STACK_NAME)

		const mapLayer = new Lambda.LayerVersion(this, 'mapLayer', {
			code: new LambdaSource(this, {
				id: 'mapBaseLayer',
				zipFile: layer.layerZipFile,
				hash: layer.hash,
			}).code,
			compatibleArchitectures: [Lambda.Architecture.ARM_64],
			compatibleRuntimes: [Lambda.Runtime.NODEJS_18_X],
		})

		const publicDevices = new PublicDevices(this)

		new LwM2MShadow(this, {
			mapLayer,
			lambdaSources,
			publicDevices,
		})

		new ConnectionInformationGeoLocation(this, {
			mapLayer,
			lambdaSources,
		})

		const shareAPI = new ShareAPI(this, {
			mapLayer,
			lambdaSources,
			publicDevices,
		})

		const devicesAPI = new DevicesAPI(this, {
			mapLayer,
			lambdaSources,
			publicDevices,
		})

		// Outputs
		new CfnOutput(this, 'shareAPIEndpoint', {
			exportName: `${this.stackName}:shareAPIEndpoint`,
			description: 'API endpoint for sharing devices',
			value: shareAPI.shareURL.url,
		})
		new CfnOutput(this, 'confirmOwnershipAPIEndpoint', {
			exportName: `${this.stackName}:confirmOwnershipAPIEndpoint`,
			description: 'API endpoint for confirming ownership',
			value: shareAPI.confirmOwnershipURL.url,
		})
		new CfnOutput(this, 'devicesAPIEndpoint', {
			exportName: `${this.stackName}:devicesAPIEndpoint`,
			description: 'API endpoint for retrieving public device information',
			value: devicesAPI.devicesURL.url,
		})
	}
}
