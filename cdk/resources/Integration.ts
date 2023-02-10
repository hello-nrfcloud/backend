import {
	aws_ec2 as EC2,
	aws_ecs as ECS,
	aws_iam as IAM,
	aws_iot as IoT,
	aws_sqs as SQS,
	aws_ssm as SSM,
	CfnOutput,
	Duration,
	Stack,
} from 'aws-cdk-lib'
import type { IVpc } from 'aws-cdk-lib/aws-ec2'
import { ICluster, LogDriver } from 'aws-cdk-lib/aws-ecs'
import type { IPrincipal } from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import type { MqttConfiguration } from '../backend'

export class Integration extends Construct {
	// public readonly mqttURI: string

	public constructor(
		parent: Stack,
		{ mqttConfiguration }: { mqttConfiguration: MqttConfiguration },
	) {
		super(parent, 'Integration')

		const vpc = new EC2.Vpc(this, `vpc`, {
			maxAzs: 2,
		})

		const cluster = new ECS.Cluster(this, `cluster`, {
			vpc: vpc as IVpc,
		})

		// Fargate
		const mqttBridgeTask = new ECS.FargateTaskDefinition(this, 'mqttBridge')
		mqttBridgeTask.addContainer('mqttBridgeContainer', {
			cpu: 256,
			memoryLimitMiB: 512,
			logging: LogDriver.awsLogs({
				streamPrefix: 'mqtt-bridge',
			}),
			containerName: 'mqtt',
			portMappings: [
				{
					containerPort: 1883,
					hostPort: 1883,
				},
			],
			image: ECS.ContainerImage.fromRegistry(
				'public.ecr.aws/q9u9d6w7/nrfcloud-bridge:latest',
			),
			secrets: {
				NRFCLOUD_CLIENT_CERT: this.getSecret(
					mqttConfiguration.SSMParams.nrfcloud.cert,
				),
				NRFCLOUD_CLIENT_KEY: this.getSecret(
					mqttConfiguration.SSMParams.nrfcloud.key,
				),
				IOT_CERT: this.getSecret(mqttConfiguration.SSMParams.iot.cert),
				IOT_KEY: this.getSecret(mqttConfiguration.SSMParams.iot.key),
			},
			environment: {
				NRFCLOUD_CA:
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
					'-----END CERTIFICATE-----',
				MOSQUITTO_CONFIG: `
listener 1883
allow_anonymous true

connection nrfcloud-bridge
address ${mqttConfiguration.accountInfo.mqttEndpoint}:8883
local_clientid nrfcloud-bridge-local
remote_clientid ${mqttConfiguration.accountInfo.accountDeviceClientId}
bridge_protocol_version mqttv311
bridge_cafile /mosquitto/config/nrfcloud_ca.crt
bridge_certfile /mosquitto/config/nrfcloud_client_cert.crt
bridge_keyfile /mosquitto/config/nrfcloud_client_key.key
bridge_insecure false
cleansession true
start_type automatic
notifications false

topic m/# in 1 data/ ${mqttConfiguration.accountInfo.mqttTopicPrefix}

connection iot-bridge
address ${mqttConfiguration.iotInfo.mqttEndpoint}:8883
bridge_cafile /mosquitto/config/nrfcloud_ca.crt
bridge_certfile /mosquitto/config/iot_cert.crt
bridge_keyfile /mosquitto/config/iot_key.key
bridge_insecure false
cleansession true
start_type automatic
notifications false

topic # out 1
`,
			},
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
				serviceName: 'mqtt',
				assignPublicIp: true,
			},
		)
		// Add inbound port to security group
		mqttBridgeService.connections.allowFrom(
			EC2.Peer.anyIpv4(),
			EC2.Port.tcp(1883),
			'inbound-mqtt',
		)

		// IoT rule
		const q = new SQS.Queue(this, 'q', {
			queueName: 'test',
			retentionPeriod: Duration.days(1),
		})
		const iotActionRole = new IAM.Role(this, 'iot-action-role', {
			assumedBy: new IAM.ServicePrincipal('iot.amazonaws.com') as IPrincipal,
		})
		q.grantSendMessages(iotActionRole)
		new IoT.CfnTopicRule(this, 'TopicRule', {
			topicRulePayload: {
				description: `Publish mqtt topic to SQS`,
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: `
					select
						get((select lat, lon as lng, uncertainty from data), 0) as location,
						topic(4) as deviceId,
						timestamp() as timestamp
					from 'data/+/+/+/c2d'
					where isUndefined(data.lat) = false
				`,
				actions: [
					{
						sqs: {
							queueUrl: q.queueUrl,
							roleArn: iotActionRole.roleArn,
						},
					},
				],
			},
		})

		// TODO: To output assigned public ip from fargate
		new CfnOutput(this, 'queue', {
			exportName: 'topicQueue',
			value: q.queueUrl,
		})
	}

	private getSecret(ssmName: string) {
		return ECS.Secret.fromSsmParameter(
			SSM.StringParameter.fromStringParameterName(
				this,
				`${ssmName}Param`,
				ssmName,
			),
		)
	}
}
