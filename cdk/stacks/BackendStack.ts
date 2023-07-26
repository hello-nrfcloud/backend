import {
	App,
	CfnOutput,
	aws_lambda as Lambda,
	Stack,
	type Environment,
} from 'aws-cdk-lib'
import { type CAFiles } from '../../bridge/caLocation.js'
import type { CertificateFiles } from '../../bridge/mqttBridgeCertificateLocation.js'
import type { BackendLambdas } from '../BackendLambdas.js'
import type { PackedLayer } from '../helpers/lambdas/packLayer.js'
import { ContinuousDeployment } from '../resources/ContinuousDeployment.js'
import { ConvertDeviceMessages } from '../resources/ConvertDeviceMessages.js'
import { DeviceLastSeen } from '../resources/DeviceLastSeen.js'
import { DeviceShadow } from '../resources/DeviceShadow.js'
import { DeviceStorage } from '../resources/DeviceStorage.js'
import { HealthCheckMqttBridge } from '../resources/HealthCheckMqttBridge.js'
import { HistoricalData } from '../resources/HistoricalData.js'
import {
	Integration,
	type BridgeImageSettings,
} from '../resources/Integration.js'
import { parameterStoreLayerARN } from '../resources/LambdaExtensionLayers.js'
import { LambdaSource } from '../resources/LambdaSource.js'
import { WebsocketAPI } from '../resources/WebsocketAPI.js'
import { KPIs } from '../resources/kpis/KPIs.js'
import { STACK_NAME } from './stackConfig.js'
import { ConfigureDevice } from '../resources/ConfigureDevice.js'

export class BackendStack extends Stack {
	public constructor(
		parent: App,
		{
			lambdaSources,
			layer,
			healthCheckLayer,
			iotEndpoint,
			mqttBridgeCertificate,
			caCertificate,
			nRFCloudAccounts,
			bridgeImageSettings,
			repository,
			gitHubOICDProviderArn,
			env,
		}: {
			lambdaSources: BackendLambdas
			layer: PackedLayer
			healthCheckLayer: PackedLayer
			iotEndpoint: string
			mqttBridgeCertificate: CertificateFiles
			caCertificate: CAFiles
			nRFCloudAccounts: string[]
			bridgeImageSettings: BridgeImageSettings
			gitHubOICDProviderArn: string
			repository: {
				owner: string
				repo: string
			}
			env: Required<Environment>
		},
	) {
		super(parent, STACK_NAME, {
			env,
		})

		const baseLayer = new Lambda.LayerVersion(this, 'baseLayer', {
			code: new LambdaSource(this, {
				id: 'baseLayer',
				zipFile: layer.layerZipFile,
				hash: layer.hash,
			}).code,
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
		const parameterStoreExtensionLayer =
			Lambda.LayerVersion.fromLayerVersionArn(
				this,
				'parameterStoreExtensionLayer',
				parameterStoreLayerARN[Stack.of(this).region] as string,
			)
		const healthCheckLayerVersion = new Lambda.LayerVersion(
			this,
			'healthCheckLayer',
			{
				code: new LambdaSource(this, {
					id: 'healthcheckLayer',
					zipFile: healthCheckLayer.layerZipFile,
					hash: healthCheckLayer.hash,
				}).code,
				compatibleArchitectures: [Lambda.Architecture.ARM_64],
				compatibleRuntimes: [Lambda.Runtime.NODEJS_18_X],
			},
		)

		const lambdaLayers: Lambda.ILayerVersion[] = [
			baseLayer,
			powerToolLayer,
			parameterStoreExtensionLayer,
		]

		const deviceStorage = new DeviceStorage(this)

		const lastSeen = new DeviceLastSeen(this)

		const websocketAPI = new WebsocketAPI(this, {
			lambdaSources,
			deviceStorage,
			layers: lambdaLayers,
			lastSeen,
		})

		new DeviceShadow(this, {
			websocketAPI,
			layers: lambdaLayers,
			lambdaSources,
			nRFCloudAccounts,
		})

		new Integration(this, {
			iotEndpoint,
			mqttBridgeCertificate,
			caCertificate,
			bridgeImageSettings,
			nRFCloudAccounts,
		})

		new HealthCheckMqttBridge(this, {
			websocketAPI,
			deviceStorage,
			layers: [...lambdaLayers, healthCheckLayerVersion],
			lambdaSources,
			nRFCloudAccounts,
		})

		new ConvertDeviceMessages(this, {
			deviceStorage,
			websocketAPI,
			lambdaSources,
			layers: lambdaLayers,
		})

		const historicalData = new HistoricalData(this, {
			lambdaSources,
			websocketAPI,
			layers: lambdaLayers,
		})

		const cd = new ContinuousDeployment(this, {
			repository,
			gitHubOICDProviderArn,
		})

		new KPIs(this, {
			lambdaSources,
			layers: lambdaLayers,
			lastSeen,
			deviceStorage,
		})

		new ConfigureDevice(this, {
			lambdaSources,
			layers: lambdaLayers,
			websocketAPI,
			nRFCloudAccounts,
		})

		// Outputs
		new CfnOutput(this, 'webSocketURI', {
			exportName: `${this.stackName}:webSocketURI`,
			description: 'The WSS Protocol URI to connect to',
			value: websocketAPI.websocketURI,
		})
		new CfnOutput(this, 'devicesTableName', {
			exportName: `${this.stackName}:devicesTableName`,
			description: 'Device table name',
			value: deviceStorage.devicesTable.tableName,
		})
		new CfnOutput(this, 'devicesTableFingerprintIndexName', {
			exportName: `${this.stackName}:devicesTableFingerprintIndexName`,
			description: 'Device table name fingerprint index name',
			value: deviceStorage.devicesTableFingerprintIndexName,
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
		new CfnOutput(this, 'cdRoleArn', {
			exportName: `${this.stackName}:cdRoleArn`,
			description: 'Role ARN to use in the deploy GitHub Actions Workflow',
			value: cd.role.roleArn,
		})
	}
}

export type StackOutputs = {
	webSocketURI: string
	devicesTableName: string
	devicesTableFingerprintIndexName: string
	historicalDataTableInfo: string
	bridgePolicyName: string
	bridgeCertificatePEM: string
	bridgeRepositoryURI: string
	bridgeImageTag: string
	cdRoleArn: string
}
