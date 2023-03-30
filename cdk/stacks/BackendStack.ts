import {
	App,
	CfnOutput,
	Duration,
	aws_lambda as Lambda,
	Stack,
} from 'aws-cdk-lib'
import { type CAFiles } from '../../bridge/caLocation.js'
import type { CertificateFiles } from '../../bridge/mqttBridgeCertificateLocation.js'
import type { BackendLambdas } from '../BackendLambdas.js'
import type { PackedLayer } from '../helpers/lambdas/packLayer.js'
import {
	Integration,
	type BridgeImageSettings,
} from '../resources/Integration.js'
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
			shadowFetchingInterval,
			bridgeImageSettings,
		}: {
			lambdaSources: BackendLambdas
			layer: PackedLayer
			iotEndpoint: string
			mqttBridgeCertificate: CertificateFiles
			caCertificate: CAFiles
			shadowFetchingInterval: number
			bridgeImageSettings: BridgeImageSettings
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
			shadowFetchingInterval: Duration.seconds(shadowFetchingInterval),
		})

		new Integration(this, {
			websocketQueue: websocketAPI.websocketQueueMessages,
			iotEndpoint,
			mqttBridgeCertificate,
			caCertificate,
			bridgeImageSettings,
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
	}
}

export type StackOutputs = {
	webSocketURI: string
	devicesTable: string
	bridgePolicyName: string
	bridgeCertificatePEM: string
	bridgeDockerRepositoryName?: string
	bridgeDockerTag?: string
	bridgeMosquittoDockerVersion?: string
}
