import { App, CfnOutput, aws_lambda as Lambda, Stack } from 'aws-cdk-lib'
import { type CAFiles } from '../../bridge/caLocation.js'
import type { CertificateFiles } from '../../bridge/mqttBridgeCertificateLocation.js'
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
			iotEndpoint,
			mqttBridgeCertificate,
			caCertificate,
		}: {
			lambdaSources: BackendLambdas
			layer: PackedLayer
			iotEndpoint: string
			mqttBridgeCertificate: CertificateFiles
			caCertificate: CAFiles
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
		})

		// const integration = new Integration(this, {
		new Integration(this, {
			websocketQueue: websocketAPI.websocketQueue,
			iotEndpoint,
			mqttBridgeCertificate,
			caCertificate,
		})

		// Outputs
		new CfnOutput(this, 'webSocketURI', {
			exportName: `${this.stackName}:webSocketURI`,
			description: 'The WSS Protocol URI to connect to',
			value: websocketAPI.websocketURI,
		})
		new CfnOutput(this, 'devicesTable', {
			exportName: `${this.stackName}:devicesTable`,
			description: 'Device table name',
			value: websocketAPI.devicesTable.tableName,
		})
		new CfnOutput(this, 'webSocketQueueURI', {
			exportName: `${this.stackName}:webSocketQueueURI`,
			description:
				'SQS queue url in which used to publish to websocket clients',
			value: websocketAPI.websocketQueue.queueUrl,
		})
	}
}

export type StackOutputs = {
	webSocketURI: string
	devicesTable: string
	webSocketQueueURI: string
	bridgePolicyName: string
	bridgeCertificatePEM: string
}
