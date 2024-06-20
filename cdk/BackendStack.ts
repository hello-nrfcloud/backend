import { repositoryName } from '@bifravst/aws-cdk-ecr-helpers/repository'
import { LambdaSource } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { PackedLayer } from '@bifravst/aws-cdk-lambda-helpers/layer'
import type { App } from 'aws-cdk-lib'
import {
	CfnOutput,
	aws_ecr as ECR,
	aws_ecs as ECS,
	aws_lambda as Lambda,
	Stack,
	type Environment,
} from 'aws-cdk-lib'
import { ContainerRepositoryId } from '../aws/ecr.js'
import { type CAFiles } from '../bridge/caLocation.js'
import type { CertificateFiles } from '../bridge/mqttBridgeCertificateLocation.js'
import type { BackendLambdas } from './packBackendLambdas.js'
import { API } from './resources/API.js'
import { APIHealthCheck } from './resources/APIHealthCheck.js'
import { UpdateDeviceState } from './resources/UpdateDeviceState.js'
import { ContinuousDeployment } from './resources/ContinuousDeployment.js'
import { ConvertNrfCloudDeviceMessages } from './resources/ConvertNrfCloudDeviceMessages.js'
import { DeviceFOTA } from './resources/DeviceFOTA.js'
import { DeviceInfo } from './resources/DeviceInfo.js'
import { DeviceLastSeen } from './resources/DeviceLastSeen.js'
import { DeviceLocationHistory } from './resources/DeviceLocationHistory.js'
import { DeviceShadow } from './resources/DeviceShadow.js'
import { DeviceStorage } from './resources/DeviceStorage.js'
import { Feedback } from './resources/Feedback.js'
import { HealthCheckCoAP } from './resources/HealthCheckCoAP.js'
import { HealthCheckMqtt } from './resources/HealthCheckMqtt.js'
import { Integration } from './resources/Integration.js'
import { LwM2MObjectsHistory } from './resources/LwM2MObjectsHistory.js'
import { Monitoring } from './resources/Monitoring.js'
import { SenMLImportLogs } from './resources/SenMLImportLogs.js'
import { CoAPSenMLtoLwM2M } from './resources/SenMLtoLwM2M.js'
import { WebsocketAPI } from './resources/WebsocketAPI.js'
import { WebsocketConnectionsTable } from './resources/WebsocketConnectionsTable.js'
import { WebsocketEventBus } from './resources/WebsocketEventBus.js'
import { KPIs } from './resources/kpis/KPIs.js'
import { STACK_NAME } from './stackConfig.js'
import type { DomainCert } from '../aws/acm.js'
import { APICustomDomain } from './resources/APICustomDomain.js'
import { MemfaultReboots } from './resources/MemfaultReboots.js'
import { LwM2MObjectID } from '@hello.nrfcloud.com/proto-map/lwm2m'

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
			apiDomain,
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
			apiDomain?: DomainCert
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
			const domain = new APICustomDomain(this, {
				api,
				apiDomain,
			})
			new CfnOutput(this, 'gatewayDomainName', {
				exportName: `${this.stackName}:gatewayDomainName`,
				description:
					'The domain name associated with the regional endpoint for the custom domain name. Use this as the target for the CNAME record for your custom domain name.',
				value: domain.gatewayDomainName.toString(),
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
			layers: [baseLayerVersion],
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
			layers: [baseLayerVersion],
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
			layers: [baseLayerVersion],
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
			'POST /device/{deviceId}/fota',
			deviceFOTA.scheduleFOTAJobFn.fn,
		)
		api.addRoute(
			'GET /device/{deviceId}/fota/jobs',
			deviceFOTA.getFOTAJobStatusFn.fn,
		)
		api.addRoute(
			'GET /device/{deviceId}/fota/bundles',
			deviceFOTA.listFOTABundles.fn,
		)

		new Monitoring(this, {
			logGroups: [
				apiHealth.fn.logGroup,
				updateDeviceState.fn.logGroup,
				convertNrfCloudDeviceMessages.onNrfCloudDeviceMessage.logGroup,
				deviceFOTA.scheduleFOTAJobFn.logGroup,
				deviceFOTA.scheduleFetches.logGroup,
				deviceFOTA.updater.logGroup,
				deviceFOTA.notifier.logGroup,
				deviceFOTA.getFOTAJobStatusFn.logGroup,
				deviceFOTA.listFOTABundles.logGroup,
				deviceInfo.fn.logGroup,
				deviceLocationHistory.scheduleFetches.logGroup,
				deviceLocationHistory.fetcher.logGroup,
				deviceLocationHistory.queryFn.logGroup,
				memfaultReboots.scheduleFetches.logGroup,
				memfaultReboots.fetcher.logGroup,
				memfaultReboots.queryFn.logGroup,
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
