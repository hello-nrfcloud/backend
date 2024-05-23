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
import {
	LambdaLogGroup,
	LambdaSource,
} from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'

/**
 * Store history of LwM2M objects
 */
export class LwM2MObjectsHistory extends Construct {
	public readonly historyFn: Lambda.IFunction

	public readonly table: Timestream.CfnTable
	public constructor(
		parent: Construct,
		{
			deviceStorage,
			lambdaSources,
			layers,
		}: {
			deviceStorage: DeviceStorage
			lambdaSources: Pick<
				BackendLambdas,
				'storeObjectsInTimestream' | 'queryLwM2MHistory'
			>
			layers: Array<Lambda.ILayerVersion>
		},
	) {
		super(parent, 'lwm2mHistory')

		const db = new Timestream.CfnDatabase(this, 'historicalData')
		this.table = new Timestream.CfnTable(this, 'historicalDataTable', {
			databaseName: db.ref,
			retentionProperties: {
				MemoryStoreRetentionPeriodInHours: '24',
				MagneticStoreRetentionPeriodInDays: '365',
			},
		})

		db.applyRemovalPolicy(
			this.node.getContext('isTest') === true
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
				VERSION: this.node.getContext('version'),
				HISTORICAL_DATA_TABLE_INFO: this.table.ref,
				NODE_NO_WARNINGS: '1',
				DISABLE_METRICS: this.node.getContext('isTest') === true ? '1' : '0',
			},
			layers,
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
					`FROM '$aws/things/+/shadow/name/lwm2m/update/accepted'`,
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

		this.historyFn = new Lambda.Function(this, 'historyFn', {
			handler: lambdaSources.queryLwM2MHistory.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(10),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.queryLwM2MHistory.zipFile),
			description: 'Queries the LwM2M object history',
			layers,
			environment: {
				VERSION: this.node.getContext('version'),
				NODE_NO_WARNINGS: '1',
				HISTORICAL_DATA_TABLE_INFO: this.table.ref,
				DISABLE_METRICS: this.node.getContext('isTest') === true ? '1' : '0',
				DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
			},
			...new LambdaLogGroup(this, 'historyFnLogs'),
			initialPolicy: [
				new IAM.PolicyStatement({
					resources: [this.table.attrArn],
					actions: [
						'timestream:Select',
						'timestream:DescribeTable',
						'timestream:ListMeasures',
					],
				}),
				new IAM.PolicyStatement({
					resources: ['*'],
					actions: [
						'timestream:DescribeEndpoints',
						'timestream:SelectValues',
						'timestream:CancelQuery',
					],
				}),
			],
		})
		deviceStorage.devicesTable.grantReadData(this.historyFn)
	}
}
