import { App, aws_lambda as Lambda, CfnOutput, Stack } from 'aws-cdk-lib'
import type { BackendLambdas } from '../BackendLambdas.js'
import type { PackedLayer } from '../packLayer.js'
import { WebsocketAPI } from '../resources/WebsocketAPI.js'
import { STACK_NAME } from './stackName.js'

export class BackendStack extends Stack {
	public constructor(
		parent: App,
		{
			lambdaSources,
			layer,
			assetTrackerStackName,
		}: {
			lambdaSources: BackendLambdas
			layer: PackedLayer
			assetTrackerStackName: string
		},
	) {
		super(parent, STACK_NAME)

		const baseLayer = new Lambda.LayerVersion(this, 'baseLayer', {
			code: Lambda.Code.fromAsset(layer.layerZipFile),
			compatibleArchitectures: [Lambda.Architecture.ARM_64],
			compatibleRuntimes: [Lambda.Runtime.NODEJS_18_X],
		})

		const api = new WebsocketAPI(this, {
			lambdaSources,
			baseLayer,
		})

		// Outputs
		new CfnOutput(this, 'WebSocketURI', {
			exportName: `${this.stackName}:WebSocketURI`,
			description: 'The WSS Protocol URI to connect to',
			value: api.websocketURI,
		})
	}
}

export type StackOutputs = {
	WebSocketURI: string
}
