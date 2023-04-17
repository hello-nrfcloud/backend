import {
	aws_ec2 as EC2,
	aws_ecr as ECR,
	aws_ecs as ECS,
	aws_iam as IAM,
	aws_iot as IoT,
	aws_sqs as SQS,
	Stack,
} from 'aws-cdk-lib'
import type { IVpc } from 'aws-cdk-lib/aws-ec2'
import type { IRepository } from 'aws-cdk-lib/aws-ecr'
import { LogDriver, type ICluster } from 'aws-cdk-lib/aws-ecs'
import type { IPrincipal } from 'aws-cdk-lib/aws-iam'
import { RetentionDays } from 'aws-cdk-lib/aws-logs'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { type CAFiles } from '../../bridge/caLocation'
import type { CertificateFiles } from '../../bridge/mqttBridgeCertificateLocation'
import { type Settings as BridgeSettings } from '../../bridge/settings'
import {
	parameterName,
	type Settings as nRFCloudSettings,
} from '../../nrfcloud/settings'
import { settingsPath } from '../../util/settings'

export type BridgeImageSettings = BridgeSettings

export class Integration extends Construct {
	public readonly bridgeCertificate: IoT.CfnCertificate
	public readonly bridgeRepository: IRepository
	public constructor(
		parent: Stack,
		{
			websocketQueue,
			iotEndpoint,
			mqttBridgeCertificate,
			caCertificate,
			bridgeImageSettings,
		}: {
			websocketQueue: SQS.Queue
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
					stackName: parent.stackName,
					scope: 'context',
					system: 'stack',
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
					stackName: parent.stackName,
					scope: 'context',
					system: 'stack',
					property: 'bridgePrivateKey',
				}),
			},
		)

		new IoT.CfnPolicyPrincipalAttachment(this, 'bridgeCertificatePolicy', {
			policyName: bridgePolicy.ref,
			principal: this.bridgeCertificate.attrArn,
		})

		const vpc = new EC2.Vpc(this, `vpc`, {
			maxAzs: 1,
		})

		const cluster = new ECS.Cluster(this, `cluster`, {
			vpc: vpc as IVpc,
		})

		const mqttBridgeTask = new ECS.FargateTaskDefinition(this, 'mqttBridge')

		const repositoryUrl = new URL(
			bridgeImageSettings.repositoryUri.replace(/^http:/, 'https:'),
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
				parameterName(parent.stackName, property),
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
			MOSQUITTO_INCLUDE_DIR: `/mosquitto/config/sections/`,
			MOSQUITTO__LOGGING__LOG_DEST: `stderr`,
			MOSQUITTO__LOGGING__LOG_TYPE: `information`,
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
			MOSQUITTO__BRIDGE01__NOTIFICATIONS: `false`,
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
			MOSQUITTO__BRIDGE02__LOCAL_CLIENTID: `iot-bridge-local`,
			MOSQUITTO__BRIDGE02__START_TYPE: `automatic`,
			MOSQUITTO__BRIDGE02__NOTIFICATIONS: `false`,
			MOSQUITTO__BRIDGE02__CLEANSESSION: `true`,
			MOSQUITTO__BRIDGE02__TOPIC: `# out 1`,
		}
		if (this.node.tryGetContext('isTest') === true) {
			environment.MOSQUITTO__LISTENERS__LISTENER = '1883'
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
				command: [
					'CMD-SHELL',
					'mosquitto_sub -p 1883 -t topic -C 1 -E -i probe -W 3',
				],
			},
		})

		const mqttBridgeService = new ECS.FargateService(
			this,
			'mqttBridgeService',
			{
				cluster: cluster as ICluster,
				taskDefinition: mqttBridgeTask,
				desiredCount: 1,
				assignPublicIp: this.node.tryGetContext('isTest') ?? false,
			},
		)
		// Add inbound port to security group
		mqttBridgeService.connections.allowFrom(
			EC2.Peer.anyIpv4(),
			EC2.Port.tcp(1883),
			'inbound-mqtt',
		)

		// IoT rule
		const iotActionRole = new IAM.Role(this, 'iot-action-role', {
			assumedBy: new IAM.ServicePrincipal('iot.amazonaws.com') as IPrincipal,
		})
		websocketQueue.grantSendMessages(iotActionRole)
		new IoT.CfnTopicRule(this, 'topicRule', {
			topicRulePayload: {
				description: `Publish mqtt topic to SQS`,
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: `
					select
						* as payload,
						topic(4) as deviceId,
						[topic(4)] as receivers,
						topic() as topic,
						timestamp() as timestamp
					from 'data/+/+/+/+'
					where messageType = 'DATA'
				`,
				actions: [
					{
						sqs: {
							queueUrl: websocketQueue.queueUrl,
							roleArn: iotActionRole.roleArn,
						},
					},
				],
			},
		})
	}
}
