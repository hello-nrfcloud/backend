import {
	IoTActionRole,
	PackedLambdaFn,
} from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { aws_lambda as Lambda } from 'aws-cdk-lib'
import {
	Duration,
	aws_dynamodb as DynamoDB,
	aws_iam as IAM,
	aws_iot as IoT,
	RemovalPolicy,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceLastSeen } from './DeviceLastSeen.js'
import type { WebsocketEventBus } from './WebsocketEventBus.js'

/**
 * Resources needed to convert LwM2M updates sent by devices via CoAP to nRF Cloud to the format that hello.nrfcloud.com expects
 */
export class CoAPSenMLtoLwM2M extends Construct {
	public readonly importLogs: DynamoDB.ITable
	public readonly fn: PackedLambdaFn
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			websocketEventBus,
			lastSeen,
		}: {
			websocketEventBus: WebsocketEventBus
			lambdaSources: Pick<BackendLambdas, 'onLwM2MUpdate'>
			layers: Lambda.ILayerVersion[]
			lastSeen: DeviceLastSeen
		},
	) {
		super(parent, 'CoAPSenMLtoLwM2M')

		// Make message conversion results available
		this.importLogs = new DynamoDB.Table(this, 'table', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'deviceId',
				type: DynamoDB.AttributeType.STRING,
			},
			sortKey: {
				name: 'importId',
				type: DynamoDB.AttributeType.STRING,
			},
			timeToLiveAttribute: 'ttl',
			removalPolicy: RemovalPolicy.DESTROY,
		})

		this.fn = new PackedLambdaFn(this, 'fn', lambdaSources.onLwM2MUpdate, {
			description: 'Convert LwM2M updates and publish them on the EventBus',
			environment: {
				EVENTBUS_NAME: websocketEventBus.eventBus.eventBusName,
				IMPORT_LOGS_TABLE_NAME: this.importLogs.tableName,
			},
			layers,
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['iot:UpdateThingShadow'],
					resources: ['*'],
				}),
			],
			timeout: Duration.minutes(2),
		})
		websocketEventBus.eventBus.grantPutEventsTo(this.fn.fn)
		this.importLogs.grantReadWriteData(this.fn.fn)

		const role = new IoTActionRole(this).role

		// SenML encoded in CBOR via CoAP
		const coapRule = new IoT.CfnTopicRule(this, 'coapTopicRule', {
			topicRulePayload: {
				description: `Convert SenML encoded in CBOR via CoAP and publish to the EventBus`,
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: `
					select
						data as senMLCBOR,
						topic(4) as deviceId,
						timestamp() as timestamp
                    from 'data/m/d/+/d2c/raw'
				`,
				actions: [
					{
						lambda: {
							functionArn: this.fn.fn.functionArn,
						},
					},
				],
				errorAction: {
					republish: {
						roleArn: role.roleArn,
						topic: 'errors',
					},
				},
			},
		})

		this.fn.fn.addPermission('coapTopicRule', {
			principal: new IAM.ServicePrincipal('iot.amazonaws.com'),
			sourceArn: coapRule.attrArn,
		})

		// SenML encoded in JSON via MQTT
		const mqttRule = new IoT.CfnTopicRule(this, 'mqttTopicRule', {
			topicRulePayload: {
				description: `Convert SenML encoded in JSON via MQTT and publish to the EventBus`,
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: `
					select
						* as senML,
						topic(4) as deviceId,
						timestamp() as timestamp
                    from 'data/m/d/+/d2c/senml'
				`,
				actions: [
					{
						lambda: {
							functionArn: this.fn.fn.functionArn,
						},
					},
				],
				errorAction: {
					republish: {
						roleArn: role.roleArn,
						topic: 'errors',
					},
				},
			},
		})

		this.fn.fn.addPermission('mqttTopicRule', {
			principal: new IAM.ServicePrincipal('iot.amazonaws.com'),
			sourceArn: mqttRule.attrArn,
		})

		// Update the lastSeen timestamp
		lastSeen.table.grantWriteData(role)
		new IoT.CfnTopicRule(this, 'lastSeenRule', {
			topicRulePayload: {
				description: `Record the timestamp when a device last sent in messages based on incoming MQTT senML messages`,
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: [
					`select`,
					`topic(4) as deviceId,`,
					`'deviceMessage' as source,`,
					`parse_time("yyyy-MM-dd'T'HH:mm:ss.S'Z'", timestamp()) as lastSeen,`,
					// Used for the unique active devices per day KPI
					`parse_time("yyyy-MM-dd", timestamp()) as day`,
					`from 'data/m/d/+/d2c/senml'`,
				].join(' '),
				actions: [
					{
						dynamoDBv2: {
							putItem: {
								tableName: lastSeen.table.tableName,
							},
							roleArn: role.roleArn,
						},
					},
				],
				errorAction: {
					republish: {
						roleArn: role.roleArn,
						topic: 'errors',
					},
				},
			},
		})
	}
}
