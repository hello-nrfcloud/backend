import {
	Duration,
	aws_iam as IAM,
	aws_iot as IoT,
	aws_lambda as Lambda,
	aws_logs as Logs,
	Stack,
	aws_dynamodb as DynamoDB,
	RemovalPolicy,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { PackedLambda } from '../helpers/lambdas/packLambda.js'
import { LambdaSource } from './LambdaSource.js'
import type { WebsocketAPI } from './WebsocketAPI.js'
import { IoTActionRole } from './IoTActionRole.js'
import type { DeviceStorage } from './DeviceStorage.js'
import { Scope } from '../../util/settings.js'

/**
 * Resolve device geo location based on network information
 */
export class SingleCellGeoLocation extends Construct {
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			websocketAPI,
			deviceStorage,
		}: {
			websocketAPI: WebsocketAPI
			deviceStorage: DeviceStorage
			lambdaSources: {
				resolveSingleCellGeoLocation: PackedLambda
			}
			layers: Lambda.ILayerVersion[]
		},
	) {
		super(parent, 'SingleCellGeoLocation')

		const table = new DynamoDB.Table(this, 'table', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'cellId',
				type: DynamoDB.AttributeType.STRING,
			},
			pointInTimeRecovery: false,
			removalPolicy: RemovalPolicy.DESTROY,
			timeToLiveAttribute: 'ttl',
		})

		const fn = new Lambda.Function(this, 'fn', {
			handler: lambdaSources.resolveSingleCellGeoLocation.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.seconds(60),
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.resolveSingleCellGeoLocation)
				.code,
			description: 'Resolve device geo location based on network information',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				EVENTBUS_NAME: websocketAPI.eventBus.eventBusName,
				NODE_NO_WARNINGS: '1',
				DISABLE_METRICS: this.node.tryGetContext('isTest') === true ? '1' : '0',
				STACK_NAME: Stack.of(this).stackName,
				DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				CACHE_TABLE_NAME: table.tableName,
			},
			layers,
			logRetention: Logs.RetentionDays.ONE_WEEK,
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['ssm:GetParametersByPath', 'ssm:GetParameter'],
					resources: [
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/${
							Scope.NRFCLOUD_ACCOUNT_PREFIX
						}`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/${
							Scope.NRFCLOUD_ACCOUNT_PREFIX
						}/*`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/nRFCloud/accounts`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/nRFCloud/accounts/*`,
					],
				}),
			],
		})
		websocketAPI.eventBus.grantPutEventsTo(fn)
		deviceStorage.devicesTable.grantReadData(fn)
		table.grantWriteData(fn)

		const rule = new IoT.CfnTopicRule(this, 'topicRule', {
			topicRulePayload: {
				description: `Resolve device geo location based on network information`,
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: `
					select
						* as message,
						topic(4) as deviceId,
						timestamp() as timestamp
					from 'data/+/+/+/+'
					where messageType = 'DATA'
					and appId = 'DEVICE'
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
