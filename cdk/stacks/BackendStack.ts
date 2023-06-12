import { App, CfnOutput, aws_lambda as Lambda, Stack } from 'aws-cdk-lib'
import { type CAFiles } from '../../bridge/caLocation.js'
import type { CertificateFiles } from '../../bridge/mqttBridgeCertificateLocation.js'
import type { Settings } from '../../nrfcloud/settings.js'
import type { BackendLambdas } from '../BackendLambdas.js'
import type { PackedLayer } from '../helpers/lambdas/packLayer.js'
import { ConvertDeviceMessages } from '../resources/ConvertDeviceMessages.js'
import { DeviceShadow } from '../resources/DeviceShadow.js'
import { DeviceStorage } from '../resources/DeviceStorage.js'
import { HistoricalData } from '../resources/HistoricalData.js'
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
			bridgeImageSettings,
			nRFCloudSettings,
		}: {
			lambdaSources: BackendLambdas
			layer: PackedLayer
			iotEndpoint: string
			mqttBridgeCertificate: CertificateFiles
			caCertificate: CAFiles
			bridgeImageSettings: BridgeImageSettings
			nRFCloudSettings: Settings
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

		const deviceStorage = new DeviceStorage(this)

		const websocketAPI = new WebsocketAPI(this, {
			lambdaSources,
			deviceStorage,
			layers: [baseLayer, powerToolLayer],
		})

		new DeviceShadow(this, {
			websocketAPI,
			layers: [baseLayer, powerToolLayer],
			lambdaSources,
		})

		new Integration(this, {
			iotEndpoint,
			mqttBridgeCertificate,
			caCertificate,
			bridgeImageSettings,
		})

		new ConvertDeviceMessages(this, {
			deviceStorage,
			websocketAPI,
			lambdaSources,
			layers: [baseLayer, powerToolLayer],
			nRFCloudSettings,
		})

		const historicalData = new HistoricalData(this, {
			lambdaSources,
			websocketAPI,
			layers: [baseLayer, powerToolLayer],
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
			value: deviceStorage.devicesTable.tableName,
		})
		new CfnOutput(this, 'bridgeRepositoryURI', {
			exportName: `${this.stackName}:bridgeRepositoryURI`,
			description: 'ECR name',
			value: bridgeImageSettings.repositoryUri,
		})
		new CfnOutput(this, 'bridgeImageTag', {
			exportName: `${this.stackName}:bridgeImageTag`,
			description: 'Mqtt bridge image tag',
			value: bridgeImageSettings.imageTag,
		})
		new CfnOutput(this, 'historicalDataTableInfo', {
			exportName: `${this.stackName}:historicalDataTableInfo`,
			description:
				'DB and Name of the Timestream table that stores historical device messages',
			value: historicalData.table.ref,
		})
	}
}

export type StackOutputs = {
	webSocketURI: string
	devicesTable: string
	historicalDataTableInfo: string
	bridgePolicyName: string
	bridgeCertificatePEM: string
	bridgeRepositoryURI: string
	bridgeImageTag: string
}
