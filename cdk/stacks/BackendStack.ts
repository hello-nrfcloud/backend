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
		}: {
			lambdaSources: BackendLambdas
			layer: PackedLayer
		},
	) {
		super(parent, STACK_NAME)

		const mqttConfiguration = this.node.tryGetContext(
			'mqttConfiguration',
		) as MqttConfiguration

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
		})

		// const integration = new Integration(this, {
		new Integration(this, {
			mqttConfiguration,
			websocketQueue: websocketAPI.websocketQueue,
		})

		// Outputs
		new CfnOutput(this, 'webSocketURI', {
			exportName: `${this.stackName}:WebSocketURI`,
			description: 'The WSS Protocol URI to connect to',
			value: websocketAPI.websocketURI,
		})
		new CfnOutput(this, 'devicesTable', {
			exportName: `${this.stackName}:devicesTable`,
			description: 'Device table name',
			value: websocketAPI.devicesTable.tableName,
		})
	}
}

export type StackOutputs = {
	webSocketURI: string
	devicesTable: string
}
