import {
	App,
	CfnOutput,
	aws_lambda as Lambda,
	Stack,
	type Environment,
	aws_ecr as ECR,
	aws_ecs as ECS,
} from 'aws-cdk-lib'
import { type CAFiles } from '../bridge/caLocation.js'
import type { CertificateFiles } from '../bridge/mqttBridgeCertificateLocation.js'
import type { BackendLambdas } from './packBackendLambdas.js'
import type { PackedLayer } from '@bifravst/aws-cdk-lambda-helpers/layer'
import { ContinuousDeployment } from './resources/ContinuousDeployment.js'
import { ConvertDeviceMessagesMQTTLegacy } from './resources/ConvertDeviceMessagesMQTTLegacy.js'
import { DeviceLastSeen } from './resources/DeviceLastSeen.js'
import { DeviceShadow } from './resources/DeviceShadow.js'
import { DeviceStorage } from './resources/DeviceStorage.js'
import { HealthCheckMqttBridge } from './resources/HealthCheckMqttBridge.js'
import { HistoricalData } from './resources/HistoricalData.js'
import { Integration } from './resources/Integration.js'
import { LambdaSource } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { WebsocketAPI } from './resources/WebsocketAPI.js'
import { KPIs } from './resources/kpis/KPIs.js'
import { STACK_NAME } from './stackConfig.js'
import { ConfigureDevice } from './resources/ConfigureDevice.js'
import { SingleCellGeoLocation } from './resources/SingleCellGeoLocation.js'
import { WebsocketConnectionsTable } from './resources/WebsocketConnectionsTable.js'
import { WebsocketEventBus } from './resources/WebsocketEventBus.js'
import { HealthCheckCoAP } from './resources/HealthCheckCoAP.js'
import { ContainerRepositoryId } from '../aws/ecr.js'
import { repositoryName } from '@bifravst/aws-cdk-ecr-helpers/repository'
import { API } from './resources/API.js'
import { CoAPSenMLtoLwM2M } from './resources/CoAPSenMLtoLwM2M.js'
import { SenMLImportLogs } from './resources/SenMLImportLogs.js'
import { Feedback } from './resources/Feedback.js'
import { DeviceInfo } from './resources/DeviceInfo.js'
import { ConnectionInformationGeoLocation } from './resources/ConnectionInformationGeoLocation.js'
import { APIHealthCheck } from './resources/APIHealthCheck.js'
import { LwM2MObjectsHistory } from './resources/LwM2MObjectsHistory.js'

export class BackendStack extends Stack {
	public constructor(
		parent: App,
		{
			lambdaSources,
			baseLayer,
			healthCheckLayer,
			iotEndpoint,
			mqttBridgeCertificate,
			caCertificate,
			nRFCloudAccounts,
			mqttBridgeContainerTag,
			coapSimulatorContainerTag,
			repository,
			gitHubOICDProviderArn,
			env,
		}: {
			lambdaSources: BackendLambdas
			baseLayer: PackedLayer
			healthCheckLayer: PackedLayer
			iotEndpoint: string
			mqttBridgeCertificate: CertificateFiles
			caCertificate: CAFiles
			nRFCloudAccounts: Array<string>
			mqttBridgeContainerTag: string
			coapSimulatorContainerTag: string
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

		const baseLayerVersion = new Lambda.LayerVersion(this, 'baseLayer', {
			layerVersionName: `${Stack.of(this).stackName}-baseLayer`,
			code: new LambdaSource(this, {
				id: 'baseLayer',
				zipFile: baseLayer.layerZipFile,
				hash: baseLayer.hash,
			}).code,
			compatibleArchitectures: [Lambda.Architecture.ARM_64],
			compatibleRuntimes: [Lambda.Runtime.NODEJS_20_X],
		})

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
				compatibleRuntimes: [Lambda.Runtime.NODEJS_20_X],
			},
		)

		const deviceStorage = new DeviceStorage(this)

		const lastSeen = new DeviceLastSeen(this)

		const websocketConnectionsTable = new WebsocketConnectionsTable(this)
		const websocketEventBus = new WebsocketEventBus(this)

		const deviceShadow = new DeviceShadow(this, {
			websocketEventBus,
			websocketConnectionsTable,
			layers: [baseLayerVersion],
			lambdaSources,
		})

		const websocketAPI = new WebsocketAPI(this, {
			lambdaSources,
			deviceStorage,
			layers: [baseLayerVersion],
			lastSeen,
			deviceShadow,
			connectionsTable: websocketConnectionsTable,
			eventBus: websocketEventBus,
		})

		const api = new API(this)
		api.addRoute(
			'GET /health',
			new APIHealthCheck(this, { layers: [baseLayerVersion], lambdaSources })
				.fn,
		)

		new Integration(this, {
			iotEndpoint,
			mqttBridgeCertificate,
			caCertificate,
			bridgeImage: ECS.ContainerImage.fromEcrRepository(
				ECR.Repository.fromRepositoryName(
					this,
					'mqtt-bridge-ecr',
					repositoryName({
						stackName: Stack.of(this).stackName,
						id: ContainerRepositoryId.MQTTBridge,
					}),
				),
				mqttBridgeContainerTag,
			),
			nRFCloudAccounts,
		})

		new HealthCheckMqttBridge(this, {
			websocketAPI,
			deviceStorage,
			layers: [baseLayerVersion, healthCheckLayerVersion],
			lambdaSources,
		})

		if (this.node.getContext('isTest') !== true) {
			new HealthCheckCoAP(this, {
				websocketAPI,
				deviceStorage,
				code: Lambda.DockerImageCode.fromEcr(
					ECR.Repository.fromRepositoryName(
						this,
						'coap-simulator-ecr',
						repositoryName({
							stackName: Stack.of(this).stackName,
							id: ContainerRepositoryId.CoAPSimulator,
						}),
					),
					{
						tagOrDigest: coapSimulatorContainerTag,
					},
				),
				layers: [baseLayerVersion, healthCheckLayerVersion],
				lambdaSources,
			})
		}

		new ConvertDeviceMessagesMQTTLegacy(this, {
			deviceStorage,
			websocketEventBus,
			lambdaSources,
			layers: [baseLayerVersion],
		})

		const convertLwM2M = new CoAPSenMLtoLwM2M(this, {
			lambdaSources,
			layers: [baseLayerVersion],
			websocketEventBus,
		})

		const senMLImportLogs = new SenMLImportLogs(this, {
			deviceStorage,
			lambdaSources,
			layers: [baseLayerVersion],
			importLogsTable: convertLwM2M.importLogs,
		})
		api.addRoute('GET /device/{id}/senml-imports', senMLImportLogs.fn)

		const historicalData = new HistoricalData(this, {
			lambdaSources,
			websocketEventBus,
			layers: [baseLayerVersion],
		})

		const cd = new ContinuousDeployment(this, {
			repository,
			gitHubOICDProviderArn,
		})

		new KPIs(this, {
			lambdaSources,
			layers: [baseLayerVersion],
			lastSeen,
			deviceStorage,
		})

		new ConfigureDevice(this, {
			lambdaSources,
			layers: [baseLayerVersion],
			websocketEventBus,
		})

		new SingleCellGeoLocation(this, {
			lambdaSources,
			layers: [baseLayerVersion],
			websocketEventBus,
			deviceStorage,
		})

		const feedback = new Feedback(this, {
			lambdaSources,
			layers: [baseLayerVersion],
		})
		api.addRoute('POST /feedback', feedback.fn)

		const deviceInfo = new DeviceInfo(this, {
			deviceStorage,
			lambdaSources,
			layers: [baseLayerVersion],
		})
		api.addRoute('GET /device', deviceInfo.fn)

		new ConnectionInformationGeoLocation(this, {
			layers: [baseLayerVersion],
			lambdaSources,
		})

		const lwm2mObjectHistory = new LwM2MObjectsHistory(this, {
			deviceStorage,
			layers: [baseLayerVersion],
			lambdaSources,
		})
		api.addRoute('GET /device/{id}/history', lwm2mObjectHistory.historyFn)

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
		new CfnOutput(this, 'historicalDataTableInfo', {
			exportName: `${this.stackName}:historicalDataTableInfo`,
			description:
				'DB and Name of the Timestream table that stores historical device messages',
			value: historicalData.table.ref,
		})
		new CfnOutput(this, 'lastSeenTableName', {
			exportName: `${this.stackName}:lastSeenTableName`,
			description: 'Last seen table name',
			value: lastSeen.table.tableName,
		})
		new CfnOutput(this, 'cdRoleArn', {
			exportName: `${this.stackName}:cdRoleArn`,
			description: 'Role ARN to use in the deploy GitHub Actions Workflow',
			value: cd.role.roleArn,
		})
		new CfnOutput(this, 'APIURL', {
			exportName: `${this.stackName}:APIURL`,
			description: 'API endpoint',
			value: api.URL,
		})
	}
}

export type StackOutputs = {
	webSocketURI: string
	devicesTableName: string
	lastSeenTableName: string
	devicesTableFingerprintIndexName: string
	historicalDataTableInfo: string
	bridgePolicyName: string
	bridgeCertificatePEM: string
	cdRoleArn: string
	APIURL: string
}
