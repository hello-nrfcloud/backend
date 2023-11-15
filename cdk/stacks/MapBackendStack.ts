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

		const baseLayer = new Lambda.LayerVersion(this, 'baseLayer', {
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
			baseLayer,
			lambdaSources,
			publicDevices,
		})

		new ConnectionInformationGeoLocation(this, {
			baseLayer,
			lambdaSources,
		})

		const shareAPI = new ShareAPI(this, {
			baseLayer,
			lambdaSources,
			publicDevices,
		})

		const devicesAPI = new DevicesAPI(this, {
			baseLayer,
			lambdaSources,
			publicDevices,
		})

		// Outputs
		new CfnOutput(this, 'shareAPIURL', {
			exportName: `${this.stackName}:shareAPI`,
			description: 'API endpoint for sharing devices',
			value: shareAPI.shareURL.url,
		})
		new CfnOutput(this, 'confirmOwnershipAPIURL', {
			exportName: `${this.stackName}:confirmOwnershipAPI`,
			description: 'API endpoint for confirming ownership',
			value: shareAPI.confirmOwnershipURL.url,
		})
		new CfnOutput(this, 'devicesAPIURL', {
			exportName: `${this.stackName}:devicesAPI`,
			description: 'API endpoint for retrieving public device information',
			value: devicesAPI.devicesURL.url,
		})
	}
}

export type StackOutputs = {
	confirmOwnershipAPIURL: string // e.g. 'https://aqt7qs3nzyo4uh2v74quysvmxe0ubeth.lambda-url.eu-west-1.on.aws/'
	devicesAPIURL: string // e.g. 'https://a2udxgawcxd5tbmmfagi726jsm0obxov.lambda-url.eu-west-1.on.aws/'
	shareAPIURL: string // e.g. 'https://iiet67bnlmbtuhiblik4wcy4ni0oujot.lambda-url.eu-west-1.on.aws/'
}
