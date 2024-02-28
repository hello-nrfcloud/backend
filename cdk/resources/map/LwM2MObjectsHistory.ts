import {
	Duration,
	aws_iam as IAM,
	aws_iot as IoT,
	aws_lambda as Lambda,
	RemovalPolicy,
	Stack,
	aws_timestream as Timestream,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { PackedLambda } from '../../helpers/lambdas/packLambda.js'
import { LambdaLogGroup } from '../LambdaLogGroup.js'
import { LambdaSource } from '../LambdaSource.js'

/**
 * Store history of LwM2M objects
 */
export class LwM2MObjectsHistory extends Construct {
	public readonly table: Timestream.CfnTable
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			baseLayer,
		}: {
			lambdaSources: {
				storeObjectsInTimestream: PackedLambda
			}
			baseLayer: Lambda.ILayerVersion
		},
	) {
		super(parent, 'historicalData')

		const db = new Timestream.CfnDatabase(this, 'historicalData')
		this.table = new Timestream.CfnTable(this, 'historicalDataTable', {
			databaseName: db.ref,
			retentionProperties: {
				MemoryStoreRetentionPeriodInHours: '24',
				MagneticStoreRetentionPeriodInDays: '365',
			},
		})

		db.applyRemovalPolicy(
			this.node.tryGetContext('isTest') === true
				? RemovalPolicy.DESTROY
				: RemovalPolicy.RETAIN,
		)

		const fn = new Lambda.Function(this, 'fn', {
			handler: lambdaSources.storeObjectsInTimestream.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(5),
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.storeObjectsInTimestream).code,
			description: 'Save LwM2M objects into Timestream database',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				HISTORICAL_DATA_TABLE_INFO: this.table.ref,
				NODE_NO_WARNINGS: '1',
				DISABLE_METRICS: this.node.tryGetContext('isTest') === true ? '1' : '0',
			},
			layers: [baseLayer],
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['timestream:WriteRecords'],
					resources: [this.table.attrArn],
				}),
				new IAM.PolicyStatement({
					actions: ['timestream:DescribeEndpoints'],
					resources: ['*'],
				}),
			],
			...new LambdaLogGroup(this, 'storeObjectsInTimestreamLogs'),
		})

		const ruleRole = new IAM.Role(this, 'ruleRole', {
			assumedBy: new IAM.ServicePrincipal(
				'iot.amazonaws.com',
			) as IAM.IPrincipal,
			inlinePolicies: {
				rootPermissions: new IAM.PolicyDocument({
					statements: [
						new IAM.PolicyStatement({
							actions: ['iot:Publish'],
							resources: [
								`arn:aws:iot:${Stack.of(parent).region}:${
									Stack.of(parent).account
								}:topic/errors`,
							],
						}),
					],
				}),
			},
		})

		const rule = new IoT.CfnTopicRule(this, 'rule', {
			topicRulePayload: {
				description: `Convert shadow updates to LwM2M`,
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: [
					`SELECT state.reported as reported,`,
					`topic(3) as deviceId`,
					`FROM '$aws/things/+/shadow/name/lwm2m/update'`,
				].join(' '),
				actions: [
					{
						lambda: {
							functionArn: fn.functionArn,
						},
					},
				],
				errorAction: {
					republish: {
						roleArn: ruleRole.roleArn,
						topic: 'errors',
					},
				},
			},
		})

		fn.addPermission('invokeByRule', {
			principal: new IAM.ServicePrincipal(
				'iot.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: rule.attrArn,
		})
	}
}
