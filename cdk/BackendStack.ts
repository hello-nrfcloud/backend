import { repositoryName } from '@bifravst/aws-cdk-ecr-helpers/repository'
import { LambdaSource } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { PackedLayer } from '@bifravst/aws-cdk-lambda-helpers/layer'
import { LwM2MObjectID } from '@hello.nrfcloud.com/proto-map/lwm2m'
import type { App } from 'aws-cdk-lib'
import {
	CfnOutput,
	aws_ecr as ECR,
	aws_ecs as ECS,
	aws_lambda as Lambda,
	Stack,
	type Environment,
} from 'aws-cdk-lib'
import { ContainerRepositoryId } from '../aws/ecr.ts'
import { type CAFiles } from '../bridge/caLocation.ts'
import type { CertificateFiles } from '../bridge/mqttBridgeCertificateLocation.ts'
import type { BackendLambdas } from './packBackendLambdas.ts'
import { API } from './resources/API.ts'
import {
	APICustomDomain,
	type CustomDomain,
} from './resources/APICustomDomain.ts'
import { APIHealthCheck } from './resources/APIHealthCheck.ts'
import { ContinuousDeployment } from './resources/ContinuousDeployment.ts'
import { ConvertNrfCloudDeviceMessages } from './resources/ConvertNrfCloudDeviceMessages.ts'
import { DeviceFOTA } from './resources/DeviceFOTA.ts'
import { DeviceInfo } from './resources/DeviceInfo.ts'
import { DeviceLastSeen } from './resources/DeviceLastSeen.ts'
import { DeviceLocationHistory } from './resources/DeviceLocationHistory.ts'
import { DeviceShadow } from './resources/DeviceShadow.ts'
import { DeviceStorage } from './resources/DeviceStorage.ts'
import { MultiBundleFOTAFlow } from './resources/FOTA/MultiBundleFlow.ts'
import { Feedback } from './resources/Feedback.ts'
import { HealthCheckCoAP } from './resources/HealthCheckCoAP.ts'
import { HealthCheckMqtt } from './resources/HealthCheckMqtt.ts'
import { Integration } from './resources/Integration.ts'
import { LwM2MObjectsHistory } from './resources/LwM2MObjectsHistory.ts'
import { MemfaultReboots } from './resources/MemfaultReboots.ts'
import { Monitoring } from './resources/Monitoring.ts'
import { SenMLImportLogs } from './resources/SenMLImportLogs.ts'
import { CoAPSenMLtoLwM2M } from './resources/SenMLtoLwM2M.ts'
import { UpdateDevice } from './resources/UpdateDevice.ts'
import { UpdateDeviceState } from './resources/UpdateDeviceState.ts'
import { WebsocketAPI } from './resources/WebsocketAPI.ts'
import { WebsocketConnectionsTable } from './resources/WebsocketConnectionsTable.ts'
import { WebsocketEventBus } from './resources/WebsocketEventBus.ts'
import { KPIs } from './resources/kpis/KPIs.ts'
import { STACK_NAME } from './stackConfig.ts'

export class BackendStack extends Stack {
	public constructor(
		parent: App,
		{
			lambdaSources,
			baseLayer,
			healthCheckLayer,
			cdkLayer,
			jwtLayer,
			iotEndpoint,
			mqttBridgeCertificate,
			caCertificate,
			nRFCloudAccounts,
			mqttBridgeContainerTag,
			repository,
			gitHubOICDProviderArn,
			env,
			apiDomain,
		}: {
			lambdaSources: BackendLambdas
			baseLayer: PackedLayer
			healthCheckLayer: PackedLayer
			cdkLayer: PackedLayer
			jwtLayer: PackedLayer
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
			apiDomain?: CustomDomain
		},
	) {
		super(parent, STACK_NAME, {
			env,
			description: 'Provides the hello.nrfcloud.com backend',
		})

		const baseLayerVersion = new Lambda.LayerVersion(this, 'baseLayer', {
			layerVersionName: `${Stack.of(this).stackName}-baseLayer`,
			code: new LambdaSource(this, {
				id: 'baseLayer',
				zipFilePath: baseLayer.layerZipFilePath,
				hash: baseLayer.hash,
			}).code,
			compatibleArchitectures: [Lambda.Architecture.ARM_64],
			compatibleRuntimes: [Lambda.Runtime.NODEJS_24_X],
		})

		const jwtLayerVersion = new Lambda.LayerVersion(this, 'jwtLayer', {
			layerVersionName: `${Stack.of(this).stackName}-jwtLayer`,
			code: new LambdaSource(this, {
				id: 'jwtLayer',
				zipFilePath: jwtLayer.layerZipFilePath,
				hash: jwtLayer.hash,
			}).code,
			compatibleArchitectures: [Lambda.Architecture.ARM_64],
			compatibleRuntimes: [Lambda.Runtime.NODEJS_24_X],
		})

		const healthCheckLayerVersion = new Lambda.LayerVersion(
			this,
			'healthCheckLayer',
			{
				code: new LambdaSource(this, {
					id: 'healthcheckLayer',
					zipFilePath: healthCheckLayer.layerZipFilePath,
					hash: healthCheckLayer.hash,
				}).code,
				compatibleArchitectures: [Lambda.Architecture.ARM_64],
				compatibleRuntimes: [Lambda.Runtime.NODEJS_24_X],
			},
		)

		const deviceStorage = new DeviceStorage(this)

		const lastSeen = new DeviceLastSeen(this)

		const websocketConnectionsTable = new WebsocketConnectionsTable(this)
		const websocketEventBus = new WebsocketEventBus(this)

		const deviceShadow = new DeviceShadow(this, {
			layers: [baseLayerVersion],
			lambdaSources,
			connectionsTable: websocketConnectionsTable,
			eventBus: websocketEventBus,
			deviceStorage,
		})

		const convertNrfCloudDeviceMessages = new ConvertNrfCloudDeviceMessages(
			this,
			{
				layers: [baseLayerVersion],
				lambdaSources,
			},
		)

		const websocketAPI = new WebsocketAPI(this, {
			lambdaSources,
			deviceStorage,
			layers: [baseLayerVersion],
			lastSeen,
			connectionsTable: websocketConnectionsTable,
			eventBus: websocketEventBus,
		})

		const api = new API(this)
		const apiHealth = new APIHealthCheck(this, {
			layers: [baseLayerVersion],
			lambdaSources,
		})
		api.addRoute('GET /health', apiHealth.fn.fn)

		if (apiDomain === undefined) {
			new CfnOutput(this, 'APIURL', {
				exportName: `${this.stackName}:APIURL`,
				description: 'API endpoint',
				value: api.URL,
			})
		} else {
			const cdkLayerVersion = new Lambda.LayerVersion(this, 'cdkLayer', {
				code: new LambdaSource(this, {
					id: 'cdkLayer',
					zipFilePath: cdkLayer.layerZipFilePath,
					hash: cdkLayer.hash,
				}).code,
				compatibleArchitectures: [Lambda.Architecture.ARM_64],
				compatibleRuntimes: [Lambda.Runtime.NODEJS_24_X],
			})
			const domain = new APICustomDomain(this, {
				api,
				apiDomain,
				lambdaSources,
				cdkLayerVersion,
			})
			new CfnOutput(this, 'APIURL', {
				exportName: `${this.stackName}:APIURL`,
				description: 'API endpoint',
				value: domain.URL,
			})
		}

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

		const healthCheckMqtt = new HealthCheckMqtt(this, {
			websocketAPI,
			deviceStorage,
			layers: [baseLayerVersion, healthCheckLayerVersion],
			lambdaSources,
		})

		const healthCheckCoAP = new HealthCheckCoAP(this, {
			websocketAPI,
			deviceStorage,
			layers: [baseLayerVersion, healthCheckLayerVersion],
			lambdaSources,
		})

		const convertLwM2M = new CoAPSenMLtoLwM2M(this, {
			lambdaSources,
			layers: [baseLayerVersion],
			websocketEventBus,
			lastSeen,
		})

		const senMLImportLogs = new SenMLImportLogs(this, {
			deviceStorage,
			lambdaSources,
			layers: [baseLayerVersion],
			importLogsTable: convertLwM2M.importLogs,
		})
		api.addRoute('GET /device/{deviceId}/senml-imports', senMLImportLogs.fn.fn)

		const cd = new ContinuousDeployment(this, {
			repository,
			gitHubOICDProviderArn,
		})

		const kpis = new KPIs(this, {
			lambdaSources,
			layers: [baseLayerVersion],
			lastSeen,
			deviceStorage,
		})

		const updateDeviceState = new UpdateDeviceState(this, {
			lambdaSources,
			layers: [baseLayerVersion],
			deviceStorage,
		})
		api.addRoute('PATCH /device/{deviceId}/state', updateDeviceState.fn.fn)

		const feedback = new Feedback(this, {
			lambdaSources,
			layers: [baseLayerVersion],
		})
		api.addRoute('POST /feedback', feedback.fn.fn)

		const deviceInfo = new DeviceInfo(this, {
			deviceStorage,
			lambdaSources,
			layers: [baseLayerVersion],
		})
		api.addRoute('GET /device', deviceInfo.fn.fn)

		const deviceLocationHistory = new DeviceLocationHistory(this, {
			lambdaSources,
			layers: [baseLayerVersion, jwtLayerVersion],
			connectionsTable: websocketConnectionsTable,
			websocketEventBus,
			deviceStorage,
		})
		api.addRoute(
			`GET /device/{deviceId}/history/${LwM2MObjectID.Geolocation_14201}/0`,
			deviceLocationHistory.queryFn.fn,
		)

		const memfaultReboots = new MemfaultReboots(this, {
			lambdaSources,
			layers: [baseLayerVersion, jwtLayerVersion],
			connectionsTable: websocketConnectionsTable,
			websocketEventBus,
			deviceStorage,
		})
		api.addRoute(
			`GET /device/{deviceId}/history/${LwM2MObjectID.Reboot_14250}/0`,
			memfaultReboots.queryFn.fn,
		)

		const lwm2mObjectsHistory = new LwM2MObjectsHistory(this, {
			deviceStorage,
			layers: [baseLayerVersion, jwtLayerVersion],
			lambdaSources,
		})
		api.addRoute(
			'GET /device/{deviceId}/history/{objectId}/{instanceId}',
			lwm2mObjectsHistory.historyFn.fn,
		)

		const deviceFOTA = new DeviceFOTA(this, {
			lambdaSources,
			layers: [baseLayerVersion],
			deviceStorage,
			websocketEventBus,
		})
		api.addRoute(
			'GET /device/{deviceId}/fota/jobs',
			deviceFOTA.getFOTAJobStatusFn.fn,
		)
		api.addRoute(
			'GET /device/{deviceId}/fota/bundles',
			deviceFOTA.listFOTABundles.fn,
		)

		// State machine to drive the multi-bundle flow
		const mbff = new MultiBundleFOTAFlow(this, {
			lambdas: lambdaSources.multiBundleFOTAFlow,
			layers: [baseLayerVersion],
			deviceFOTA,
			deviceStorage,
		})

		api.addRoute(
			'POST /device/{deviceId}/fota/{target}',
			mbff.startMultiBundleFOTAFlow.fn,
		)

		api.addRoute(
			'DELETE /device/{deviceId}/fota/job/{jobId}',
			mbff.abortMultiBundleFOTAFlow.fn,
		)

		const updateDevice = new UpdateDevice(this, {
			lambdaSources,
			layers: [baseLayerVersion],
			deviceStorage,
		})
		api.addRoute(
			'POST /device/{deviceId}/hideDataBefore',
			updateDevice.hideDataBeforeFn.fn,
		)

		new Monitoring(this, {
			logGroups: [
				apiHealth.fn.logGroup,
				updateDeviceState.fn.logGroup,
				convertNrfCloudDeviceMessages.onNrfCloudDeviceMessage.logGroup,
				deviceFOTA.logGroup,
				deviceInfo.fn.logGroup,
				deviceLocationHistory.scheduleFetches.logGroup,
				deviceLocationHistory.fetcher.logGroup,
				deviceLocationHistory.queryFn.logGroup,
				memfaultReboots.logGroup,
				deviceShadow.prepareDeviceShadow.logGroup,
				deviceShadow.fetchDeviceShadow.logGroup,
				deviceShadow.publishShadowUpdatesToWebsocket.logGroup,
				feedback.fn.logGroup,
				healthCheckCoAP.coapLambda.logGroup,
				healthCheckCoAP.healthCheckCoAP.logGroup,
				healthCheckMqtt.healthCheck.logGroup,
				lwm2mObjectsHistory.storeFn.logGroup,
				lwm2mObjectsHistory.historyFn.logGroup,
				senMLImportLogs.fn.logGroup,
				convertLwM2M.fn.logGroup,
				websocketAPI.onConnectFn.logGroup,
				websocketAPI.onMessageFn.logGroup,
				websocketAPI.onDisconnectFn.logGroup,
				websocketAPI.authorizerFn.logGroup,
				websocketAPI.publishToWebsocketClientsFn.logGroup,
				kpis.fn.logGroup,
				updateDevice.hideDataBeforeFn.logGroup,
			],
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
			value: lwm2mObjectsHistory.table.ref,
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
