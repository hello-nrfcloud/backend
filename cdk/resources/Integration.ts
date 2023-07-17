import {
	Duration,
	aws_ec2 as EC2,
	aws_ecr as ECR,
	aws_ecs as ECS,
	aws_iot as IoT,
	Stack,
} from 'aws-cdk-lib'
import type { IRepository } from 'aws-cdk-lib/aws-ecr'
import { LogDriver, type ICluster } from 'aws-cdk-lib/aws-ecs'
import { RetentionDays } from 'aws-cdk-lib/aws-logs'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { type CAFiles } from '../../bridge/caLocation.js'
import type { CertificateFiles } from '../../bridge/mqttBridgeCertificateLocation'
import { type Settings as BridgeSettings } from '../../bridge/settings.js'
import {
	parameterName,
	type Settings as nRFCloudSettings,
} from '../../nrfcloud/settings.js'
import { Scope, settingsPath } from '../../util/settings.js'

export type BridgeImageSettings = BridgeSettings

export class Integration extends Construct {
	public readonly bridgeCertificate: IoT.CfnCertificate
	public readonly bridgeRepository: IRepository
	public constructor(
		parent: Construct,
		{
			iotEndpoint,
			mqttBridgeCertificate,
			caCertificate,
			bridgeImageSettings,
		}: {
			iotEndpoint: string
			mqttBridgeCertificate: CertificateFiles
			caCertificate: CAFiles
			bridgeImageSettings: BridgeImageSettings
		},
	) {
		super(parent, 'Integration')

		const caCert = readFileSync(caCertificate.cert, 'utf-8')
		const caVerificationCert = readFileSync(
			caCertificate.verificationCert,
			'utf-8',
		)
		const ca = new IoT.CfnCACertificate(this, 'bridgeCA', {
			caCertificatePem: caCert,
			status: 'ACTIVE',
			autoRegistrationStatus: 'DISABLE',
			certificateMode: 'DEFAULT',
			verificationCertificatePem: caVerificationCert,
		})

		const bridgePolicy = new IoT.CfnPolicy(this, 'bridgePolicy', {
			policyDocument: {
				Version: '2012-10-17',
				Statement: [
					{
						Effect: 'Allow',
						Action: ['iot:Connect'],
						Resource: ['arn:aws:iot:*:*:client/*'],
					},
					{
						Effect: 'Allow',
						Action: [
							'iot:Receive',
							'iot:UpdateThingShadow',
							'iot:GetThingShadow',
						],
						Resource: ['*'],
					},
					{
						Effect: 'Allow',
						Action: ['iot:Subscribe'],
						Resource: ['*'],
					},
					{
						Effect: 'Allow',
						Action: ['iot:Publish'],
						Resource: ['*'],
					},
				],
			},
		})

		const bridgePrivateKey = readFileSync(mqttBridgeCertificate.key, 'utf-8')
		const bridgeCertificate = readFileSync(mqttBridgeCertificate.cert, 'utf-8')
		this.bridgeCertificate = new IoT.CfnCertificate(this, 'bridgeCertificate', {
			status: 'ACTIVE',
			certificateMode: 'DEFAULT',
			certificatePem: bridgeCertificate,
			caCertificatePem: caCert,
		})
		this.bridgeCertificate.node.addDependency(ca)

		const brigeCertificateParameter = new StringParameter(
			this,
			'brigeCertificateParameter',
			{
				stringValue: bridgeCertificate,
				simpleName: false,
				parameterName: settingsPath({
					stackName: Stack.of(this).stackName,
					scope: Scope.STACK_MQTT_BRIDGE,
					property: 'bridgeCertificatePEM',
				}),
			},
		)
		const bridgePrivateKeyParameter = new StringParameter(
			this,
			'bridgePrivateKeyParameter',
			{
				stringValue: bridgePrivateKey,
				simpleName: false,
				parameterName: settingsPath({
					stackName: Stack.of(this).stackName,
					scope: Scope.STACK_MQTT_BRIDGE,
					property: 'bridgePrivateKey',
				}),
			},
		)

		new IoT.CfnPolicyPrincipalAttachment(this, 'bridgeCertificatePolicy', {
			policyName: bridgePolicy.ref,
			principal: this.bridgeCertificate.attrArn,
		})

		const vpc = EC2.Vpc.fromLookup(this, 'DefaultVPC', { isDefault: true })

		const cluster = new ECS.Cluster(this, `cluster`, {
			vpc,
		})

		const mqttBridgeTask = new ECS.FargateTaskDefinition(this, 'mqttBridge')
		// Repository uri does not have protocol part while URL requires protocol
		const repositoryUrl = new URL(
			`https://${bridgeImageSettings.repositoryUri}`,
		)
		this.bridgeRepository = ECR.Repository.fromRepositoryName(
			this,
			'repo',
			repositoryUrl.pathname.replace(/^\//, ''),
		)

		const nrfCloudSetting = (property: keyof nRFCloudSettings) =>
			StringParameter.fromStringParameterName(
				this,
				`${property}Parameter`,
				parameterName(Stack.of(this).stackName, property),
			)

		const nrfCloudSettingSecret = (property: keyof nRFCloudSettings) =>
			ECS.Secret.fromSsmParameter(nrfCloudSetting(property))

		const environment: Record<string, string> = {
			ENV__FILE__NRFCLOUD_CA_CRT:
				'-----BEGIN CERTIFICATE-----\n' +
				'MIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF\n' +
				'ADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6\n' +
				'b24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL\n' +
				'MAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv\n' +
				'b3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj\n' +
				'ca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM\n' +
				'9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw\n' +
				'IFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6\n' +
				'VOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L\n' +
				'93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm\n' +
				'jgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC\n' +
				'AYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA\n' +
				'A4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI\n' +
				'U5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs\n' +
				'N+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vv\n' +
				'o/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU\n' +
				'5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpy\n' +
				'rqXRfboQnoZsG4q5WTP468SQvvG5\n' +
				'-----END CERTIFICATE-----\n',
			MOSQUITTO_INCLUDE_DIR: `/mosquitto/config/sections`,
			MOSQUITTO__LOGGING__LOG_DEST: `stderr`,
			MOSQUITTO__LOGGING__LOG_TYPE: `all`,
			MOSQUITTO__BRIDGE01__CONNECTION: `nrfcloud-bridge`,
			MOSQUITTO__BRIDGE01__ADDRESS: `${
				nrfCloudSetting('mqttEndpoint').stringValue
			}:8883`,
			MOSQUITTO__BRIDGE01__BRIDGE_PROTOCOL_VERSION: `mqttv311`,
			MOSQUITTO__BRIDGE01__BRIDGE_CAFILE: `/mosquitto/security/nrfcloud_ca.crt`,
			MOSQUITTO__BRIDGE01__BRIDGE_CERTFILE: `/mosquitto/security/nrfcloud_client.crt`,
			MOSQUITTO__BRIDGE01__BRIDGE_KEYFILE: `/mosquitto/security/nrfcloud_client.key`,
			MOSQUITTO__BRIDGE01__BRIDGE_INSECURE: `false`,
			MOSQUITTO__BRIDGE01__START_TYPE: `automatic`,
			MOSQUITTO__BRIDGE01__KEEPALIVE_INTERVAL: `30`,
			MOSQUITTO__BRIDGE01__NOTIFICATIONS: `true`,
			MOSQUITTO__BRIDGE01__NOTIFICATIONS_LOCAL_ONLY: `true`,
			MOSQUITTO__BRIDGE01__CLEANSESSION: `true`,
			MOSQUITTO__BRIDGE01__LOCAL_CLIENTID: `nrfcloud-bridge-local`,
			MOSQUITTO__BRIDGE01__REMOTE_CLIENTID: nrfCloudSetting(
				'accountDeviceClientId',
			).stringValue,
			MOSQUITTO__BRIDGE01__TOPIC: `m/# in 1 data/ ${
				nrfCloudSetting('mqttTopicPrefix').stringValue
			}`,
			MOSQUITTO__BRIDGE02__CONNECTION: `iot-bridge`,
			MOSQUITTO__BRIDGE02__ADDRESS: `${iotEndpoint}:8883`,
			MOSQUITTO__BRIDGE02__BRIDGE_PROTOCOL_VERSION: `mqttv311`,
			MOSQUITTO__BRIDGE02__BRIDGE_CAFILE: `/mosquitto/security/nrfcloud_ca.crt`,
			MOSQUITTO__BRIDGE02__BRIDGE_CERTFILE: `/mosquitto/security/iot.crt`,
			MOSQUITTO__BRIDGE02__BRIDGE_KEYFILE: `/mosquitto/security/iot.key`,
			MOSQUITTO__BRIDGE02__BRIDGE_INSECURE: `false`,
			MOSQUITTO__BRIDGE02__BRIDGE_TRY_PRIVATE: `true`,
			MOSQUITTO__BRIDGE02__LOCAL_CLIENTID: `iot-bridge-local`,
			MOSQUITTO__BRIDGE02__START_TYPE: `automatic`,
			MOSQUITTO__BRIDGE02__KEEPALIVE_INTERVAL: `30`,
			MOSQUITTO__BRIDGE02__NOTIFICATIONS: `true`,
			MOSQUITTO__BRIDGE02__NOTIFICATIONS_LOCAL_ONLY: `true`,
			MOSQUITTO__BRIDGE02__CLEANSESSION: `true`,
			MOSQUITTO__BRIDGE02__TOPIC: `# out 1`,
		}
		if (this.node.tryGetContext('isTest') === true) {
			environment.MOSQUITTO__DEFAULT__LISTENER = `1883`
			environment.MOSQUITTO__SECURITY__ALLOW_ANONYMOUS = `true`
		}

		mqttBridgeTask.addContainer('mqttBridgeContainer', {
			cpu: 256,
			memoryLimitMiB: 512,
			logging: LogDriver.awsLogs({
				streamPrefix: 'mqtt-bridge',
				logRetention: RetentionDays.ONE_DAY,
			}),
			portMappings: [
				{
					containerPort: 1883,
					hostPort: 1883,
				},
			],
			image: ECS.ContainerImage.fromEcrRepository(
				this.bridgeRepository,
				bridgeImageSettings.imageTag,
			),
			secrets: {
				ENV__FILE__NRFCLOUD_CLIENT_CRT: nrfCloudSettingSecret(
					'accountDeviceClientCert',
				),
				ENV__FILE__NRFCLOUD_CLIENT_KEY: nrfCloudSettingSecret(
					'accountDevicePrivateKey',
				),
				ENV__FILE__IOT_CRT: ECS.Secret.fromSsmParameter(
					brigeCertificateParameter,
				),
				ENV__FILE__IOT_KEY: ECS.Secret.fromSsmParameter(
					bridgePrivateKeyParameter,
				),
			},
			environment,
			healthCheck: {
				command: ['CMD-SHELL', '/health.sh'],
				interval: Duration.minutes(1),
				retries: 3,
				startPeriod: Duration.minutes(3),
				timeout: Duration.seconds(5),
			},
		})

		const mqttBridgeService = new ECS.FargateService(
			this,
			'mqttBridgeService',
			{
				cluster: cluster as ICluster,
				taskDefinition: mqttBridgeTask,
				desiredCount: 1,
				// Required for shared VPC and access to SSM Parameters
				assignPublicIp: true,
			},
		)
		// Add inbound port to security group
		mqttBridgeService.connections.allowFrom(
			EC2.Peer.anyIpv4(),
			EC2.Port.tcp(1883),
			'inbound-mqtt',
		)
	}
}
