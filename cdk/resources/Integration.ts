import {
	aws_ec2 as EC2,
	aws_ecs as ECS,
	aws_elasticloadbalancingv2 as ELB,
	Stack,
} from 'aws-cdk-lib'
import type { IVpc } from 'aws-cdk-lib/aws-ec2'
import { ICluster, LogDriver } from 'aws-cdk-lib/aws-ecs'
import { Construct } from 'constructs'

export class Integration extends Construct {
	public readonly mqttURI: string

	public constructor(parent: Stack) {
		super(parent, 'Integration')

		const vpc = new EC2.Vpc(this, `vpc`, {
			maxAzs: 2,
		})

		const cluster = new ECS.Cluster(this, `cluster`, {
			vpc: vpc as IVpc,
		})

		const nlb = new ELB.NetworkLoadBalancer(this, 'nlb', {
			loadBalancerName: 'mqttLoadBalancer',
			vpc: vpc as IVpc,
			internetFacing: true,
		})
		this.mqttURI = nlb.loadBalancerDnsName
		const listener = nlb.addListener('mqtt-1883', {
			port: 1883,
		})

		const sg = new EC2.SecurityGroup(this, 'sg', {
			securityGroupName: 'mqtt',
			vpc: vpc as IVpc,
			allowAllOutbound: true,
		})
		sg.addIngressRule(EC2.Peer.ipv4('0.0.0.0/0'), EC2.Port.tcp(1883), 'mqtt')

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
				{
					containerPort: 9000,
					hostPort: 9000,
				},
			],
			image: ECS.ContainerImage.fromRegistry(
				'public.ecr.aws/q9u9d6w7/nrfcloud-bridge:latest',
			),
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
				NRFCLOUD_CLIENT_CERT: `-----BEGIN CERTIFICATE-----
MIIDWjCCAkKgAwIBAgIVAPkArhrt3GKHPeguTns3jPvlPopyMA0GCSqGSIb3DQEB
CwUAME0xSzBJBgNVBAsMQkFtYXpvbiBXZWIgU2VydmljZXMgTz1BbWF6b24uY29t
IEluYy4gTD1TZWF0dGxlIFNUPVdhc2hpbmd0b24gQz1VUzAeFw0yMzAyMDIwOTM4
MjhaFw00OTEyMzEyMzU5NTlaMB4xHDAaBgNVBAMME0FXUyBJb1QgQ2VydGlmaWNh
dGUwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDQyYwXECJ5qGGUW8Ep
k99xHDWMrYND96BhvXGOEBfJD3EjqaY85vnGLjZKrqy5blmRGRDevb2zkgWQHYIb
ZGbjDakUvvMQI3ibOFod0wTuT7MgD9k0uePoWjIBzSDq/FloBfyAQsDaZ8vZazTG
de/f7ORN6XZGiLjkvVAGaAP3tAhD1iazB/rTVl43xuNJa4MK+u9+Kh1i1EDLYj74
HPbxiVysrhPSvVe/QcEoIGERs/JBLy5wXgZkrbrrTpTKRdQo5EoI9GoOPTdCUdQ5
tmRRsBcT8q3M8pDgZkgg682t1FcHKqQNnHm1fr/KBtSl2dlvjD+VoEDkkuKUDLL0
f5RnAgMBAAGjYDBeMB8GA1UdIwQYMBaAFOZFX7yfDp9lBQqYlZ7cYGvvt0MgMB0G
A1UdDgQWBBT8frPDyH3veJBMsh1WPXoTjWIysTAMBgNVHRMBAf8EAjAAMA4GA1Ud
DwEB/wQEAwIHgDANBgkqhkiG9w0BAQsFAAOCAQEAlJLqFP4UCDJsseyaFH5T5OVZ
qcH4p/p9y2+I9p7xthTYhbOpKw0Dxdaw5PMECWi1++9oPshDHIbaJPIhGV0tnpcQ
6S5mYZIAfDLG80lRx8GH0lX5Rpl0KsiNdZDbWpIskEQdcSCsa+BX/ST4hNMk4ulF
bLh6XAho1riHv/LRqX3yfBWpKfqsvCM9InsDD1v4+YF9pup+ojR7er0dMInc5I5d
aGa5p0sHAvyoi+T8TGWZv+d0qLSaKJwP7KLQlKF7/1veKUaRa/9NonD15x8Evr4K
ngrNxmOQkqeBwuJlb55+4jIAPXG0jsjkPAjg+8GIcRw/k94gcEdTu3VGvVI7EQ==
-----END CERTIFICATE-----
`,
				NRFCLOUD_CLIENT_KEY: `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0MmMFxAieahhlFvBKZPfcRw1jK2DQ/egYb1xjhAXyQ9xI6mm
POb5xi42Sq6suW5ZkRkQ3r29s5IFkB2CG2Rm4w2pFL7zECN4mzhaHdME7k+zIA/Z
NLnj6FoyAc0g6vxZaAX8gELA2mfL2Ws0xnXv3+zkTel2Roi45L1QBmgD97QIQ9Ym
swf601ZeN8bjSWuDCvrvfiodYtRAy2I++Bz28YlcrK4T0r1Xv0HBKCBhEbPyQS8u
cF4GZK26606UykXUKORKCPRqDj03QlHUObZkUbAXE/KtzPKQ4GZIIOvNrdRXByqk
DZx5tX6/ygbUpdnZb4w/laBA5JLilAyy9H+UZwIDAQABAoIBABKyie4izsOQVbTA
hsrfaDor6YvAminDCkTWf03WmRqzXFFyRuXbVXDvAIOtouA0Rqcc1Irt+QgUwpTG
X7luQ1yAA61M8F14n7tez4suM5nX31W2tZ/oKcXMFgBdS15f3O3Y42TlFXo5o2LE
HATN2P53q3ZiuunUIqKxZXI9bGWJO2Uwx9QlmhjPitZcOkEe/tbLrmRyCOTLkRB3
L0iOkKBU3HBZe185HmWhgyYvpVofIMFVpVSTDUWth+DY6TMuO4H64r6ug6Xps4Wb
FXiCkOqbgLyc42884+nxLCGIGnfA0i4w753l+/hJMWWMCVxlR2At4XoMaLrzNhs4
0U7RUAkCgYEA8b7kFFY5chUiTgSAjg18q0PeyYhqROKJlYqkrsNU/3CIxSfd4ZY0
3sRj+RlnjgL24OYDfbrtd5xoSkPwztWEs4RoaG9Y9io3lWAejMWIV8KitrJ15MpG
RD2M3XZTOTbOZ/ucTbdjLWMddIx/7lRnVWjZB8soDdJp2jWIKLt8U2UCgYEA3Rkn
xBHOkS/j6CmLfGOHNLIE70zALguiZJaz5A2eK/trbMNSoRXSVg1SNdDsOlBdPgB4
IBojqgMqXzu5SK2i9O1PfTU6hFECvAqm/z0LOPSUO0GH8xjnkiwSKWzdaShSZpq1
YnhZ7k+f/P/Jgoroxt/H3V8r9o5CSR/iV2D7+dsCgYBSxE6Gf/bvDjlOiNAS0p9K
a9RNH71ylDUS1AMKKqphQoAxMDMRV0IGuyqXUJFZ1736xgWP+H3xI8W5F4XM6uGi
LMUqbGUC8vVQ2TXccIz7rxHSh0tB59ci6gfekvJvdko447ZiDVWRZovhKXFrgc5X
OayEtJOkF9RR914ExBwO2QKBgH5BTyP3xy3BWzPIBY8ShrLgtVCxU0z399PY+wDP
hfM3rzB8mULDY0kgckGo/DyQh65QNkiepJ8BD8EyKawG+3dBzJKDQtcsK5OVwacf
BLmRcNQlp6x6HEKsR/K/5++Uxvkwf0Or1i7v6TxgFIInMKXgRBF1t3Uj51Y6jtW2
3CzhAoGBALsq3U92vfOnEzcGvwIKo0WwKDooerWsABJNeFCBVVs/P8ioM/7Wx7fU
OBgHejqY2FepEtnONomhSi8sSIgSlqITC1hQY9djuolr2TtYVqKWVK7hdhwH1inM
gx7my4L5HUJCl5HjjvsOjRJF9Je9LMRXC1bGM3S1nVEe9175ix9X
-----END RSA PRIVATE KEY-----
`,
				MOSQUITTO_CONFIG: `
listener 1883
allow_anonymous true

connection nrfcloud-bridge
address mqtt.nrfcloud.com:8883
local_clientid nrfcloud-bridge-local
remote_clientid account-543c2184-c7fe-4ca6-a2a0-c06db425fbbf
bridge_protocol_version mqttv311
bridge_cafile /mosquitto/config/nrfcloud_ca.crt
bridge_certfile /mosquitto/config/nrfcloud_client_cert.crt
bridge_keyfile /mosquitto/config/nrfcloud_client_key.key
bridge_insecure false
cleansession true
start_type automatic
notifications false

topic m/# in 1 data/ prod/543c2184-c7fe-4ca6-a2a0-c06db425fbbf/
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
				securityGroups: [sg],
			},
		)

		listener.addTargets('mqttBridgeTargetGroup', {
			targetGroupName: 'mqttBridgeTargetGroup',
			port: 1883,
			targets: [mqttBridgeService],
		})
	}
}
