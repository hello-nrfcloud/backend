import { App, aws_lambda as Lambda, CfnOutput, Stack } from 'aws-cdk-lib'
import type { MqttConfiguration } from '../backend.js'
import type { BackendLambdas } from '../BackendLambdas.js'
import type { PackedLayer } from '../packLayer.js'
import { Integration } from '../resources/Integration.js'
import { WebsocketAPI } from '../resources/WebsocketAPI.js'
import { STACK_NAME } from './stackConfig.js'

export class BackendStack extends Stack {
	public constructor(
		parent: App,
		{
			lambdaSources,
			layer,
			mqttConfiguration,
			devicesTableName,
		}: {
			lambdaSources: BackendLambdas
			layer: PackedLayer
			mqttConfiguration: MqttConfiguration
			devicesTableName: string
		},
	) {
		super(parent, STACK_NAME)

		const baseLayer = new Lambda.LayerVersion(this, 'baseLayer', {
			code: Lambda.Code.fromAsset(layer.layerZipFile),
			compatibleArchitectures: [Lambda.Architecture.ARM_64],
			compatibleRuntimes: [Lambda.Runtime.NODEJS_18_X],
		})
		const powerToolLayer = Lambda.LayerVersion.fromLayerVersionArn(
			this,
			'powertoolsLayer',
			`arn:aws:lambda:${
				Stack.of(this).region
			}:094274105915:layer:AWSLambdaPowertoolsTypeScript:7`,
		)

		const websocketAPI = new WebsocketAPI(this, {
			lambdaSources,
			layers: [baseLayer, powerToolLayer],
			devicesTableName,
		})

		// const integration = new Integration(this, {
		new Integration(this, {
			mqttConfiguration,
			websocketQueue: websocketAPI.websocketQueue,
		})

		// Outputs
		new CfnOutput(this, 'WebSocketURI', {
			exportName: `${this.stackName}:WebSocketURI`,
			description: 'The WSS Protocol URI to connect to',
			value: websocketAPI.websocketURI,
		})
	}
}

export type StackOutputs = {
	WebSocketURI: string
}
