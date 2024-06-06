import type { App } from 'aws-cdk-lib'
import {
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
import { DeviceLastSeen } from './resources/DeviceLastSeen.js'
import { DeviceShadow } from './resources/DeviceShadow.js'
import { DeviceStorage } from './resources/DeviceStorage.js'
import { HealthCheckMqttBridge } from './resources/HealthCheckMqttBridge.js'
import { Integration } from './resources/Integration.js'
import { LambdaSource } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { WebsocketAPI } from './resources/WebsocketAPI.js'
import { KPIs } from './resources/kpis/KPIs.js'
import { STACK_NAME } from './stackConfig.js'
import { ConfigureDevice } from './resources/ConfigureDevice.js'
import { WebsocketConnectionsTable } from './resources/WebsocketConnectionsTable.js'
import { WebsocketEventBus } from './resources/WebsocketEventBus.js'
import { HealthCheckCoAP } from './resources/HealthCheckCoAP.js'
import { ContainerRepositoryId } from '../aws/ecr.js'
import { repositoryName } from '@bifravst/aws-cdk-ecr-helpers/repository'
import { API } from './resources/API.js'
import { CoAPSenMLtoLwM2M } from './resources/SenMLtoLwM2M.js'
import { SenMLImportLogs } from './resources/SenMLImportLogs.js'
import { Feedback } from './resources/Feedback.js'
import { DeviceInfo } from './resources/DeviceInfo.js'
import { APIHealthCheck } from './resources/APIHealthCheck.js'
import { LwM2MObjectsHistory } from './resources/LwM2MObjectsHistory.js'
import { ConvertNrfCloudDeviceMessages } from './resources/ConvertDeviceMessages.js'
import { DeviceLocationHistory } from './resources/DeviceLocationHistory.js'
import { DeviceFOTA } from './resources/DeviceFOTA.js'

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

		new DeviceShadow(this, {
			layers: [baseLayerVersion],
			lambdaSources,
			connectionsTable: websocketConnectionsTable,
			eventBus: websocketEventBus,
			deviceStorage,
		})

		new ConvertNrfCloudDeviceMessages(this, {
			layers: [baseLayerVersion],
			lambdaSources,
		})

		const websocketAPI = new WebsocketAPI(this, {
			lambdaSources,
			deviceStorage,
			layers: [baseLayerVersion],
			lastSeen,
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

		new HealthCheckCoAP(this, {
			websocketAPI,
			deviceStorage,
			layers: [baseLayerVersion, healthCheckLayerVersion],
			lambdaSources,
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

		const configureDevice = new ConfigureDevice(this, {
			lambdaSources,
			layers: [baseLayerVersion],
			deviceStorage,
		})
		api.addRoute('PATCH /device/{id}/state', configureDevice.fn)

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

		const lwm2mObjectHistory = new LwM2MObjectsHistory(this, {
			deviceStorage,
			layers: [baseLayerVersion],
			lambdaSources,
		})
		api.addRoute(
			'GET /device/{deviceId}/history/{objectId}/{instanceId}',
			lwm2mObjectHistory.historyFn,
		)

		const deviceFOTA = new DeviceFOTA(this, {
			lambdaSources,
			layers: [baseLayerVersion],
			deviceStorage,
			websocketEventBus,
		})
		api.addRoute('POST /device/{id}/fota', deviceFOTA.scheduleFOTAJobFn)
		api.addRoute('GET /device/{id}/fota/jobs', deviceFOTA.getFOTAJobStatusFn)

		new DeviceLocationHistory(this, {
			lambdaSources,
			layers: [baseLayerVersion],
			connectionsTable: websocketConnectionsTable,
			lwm2mHistory: lwm2mObjectHistory,
			websocketEventBus,
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
		new CfnOutput(this, 'lwm2mObjectHistoryTableInfo', {
			exportName: `${this.stackName}:lwm2mObjectHistoryTableInfo`,
			description:
				'DB and Name of the Timestream table that stores LwM2M object updates',
			value: lwm2mObjectHistory.table.ref,
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
	lwm2mObjectHistoryTableInfo: string
	bridgePolicyName: string
	bridgeCertificatePEM: string
	cdRoleArn: string
	APIURL: string
}
