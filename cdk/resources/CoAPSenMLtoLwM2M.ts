import {
	Duration,
	aws_iam as IAM,
	aws_iot as IoT,
	aws_lambda as Lambda,
	aws_dynamodb as DynamoDB,
	RemovalPolicy,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { IoTActionRole } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { LambdaSource } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { WebsocketEventBus } from './WebsocketEventBus.js'
import { LambdaLogGroup } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { BackendLambdas } from '../packBackendLambdas.js'

/**
 * Resources needed to convert LwM2M updates sent by devices via CoAP to nRF Cloud to the format that hello.nrfcloud.com expects
 */
export class CoAPSenMLtoLwM2M extends Construct {
	public readonly importLogs: DynamoDB.ITable
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			websocketEventBus,
		}: {
			websocketEventBus: WebsocketEventBus
			lambdaSources: Pick<BackendLambdas, 'onLwM2MUpdate'>
			layers: Lambda.ILayerVersion[]
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

		const fn = new Lambda.Function(this, 'fn', {
			handler: lambdaSources.onLwM2MUpdate.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(5),
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.onLwM2MUpdate).code,
			description: 'Convert LwM2M updates and publish them on the EventBus',
			environment: {
				VERSION: this.node.getContext('version'),
				EVENTBUS_NAME: websocketEventBus.eventBus.eventBusName,
				NODE_NO_WARNINGS: '1',
				DISABLE_METRICS: this.node.getContext('isTest') === true ? '1' : '0',
				IMPORT_LOGS_TABLE_NAME: this.importLogs.tableName,
			},
			layers,
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['iot:UpdateThingShadow'],
					resources: ['*'],
				}),
			],
			...new LambdaLogGroup(this, 'fnLogs'),
		})
		websocketEventBus.eventBus.grantPutEventsTo(fn)
		this.importLogs.grantReadWriteData(fn)

		const rule = new IoT.CfnTopicRule(this, 'topicRule', {
			topicRulePayload: {
				description: `Convert received message and publish to the EventBus`,
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
							functionArn: fn.functionArn,
						},
					},
				],
				errorAction: {
					republish: {
						roleArn: new IoTActionRole(this).roleArn,
						topic: 'errors',
					},
				},
			},
		})

		fn.addPermission('topicRule', {
			principal: new IAM.ServicePrincipal('iot.amazonaws.com'),
			sourceArn: rule.attrArn,
		})
	}
}
