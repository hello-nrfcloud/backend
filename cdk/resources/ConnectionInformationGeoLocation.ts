import { Construct } from 'constructs'
import {
	Duration,
	aws_dynamodb as DynamoDB,
	aws_iam as IAM,
	aws_iot as IoT,
	aws_lambda as Lambda,
	RemovalPolicy,
	Stack,
} from 'aws-cdk-lib'
import { STACK_NAME } from '../stackConfig.js'
import {
	LambdaLogGroup,
	LambdaSource,
	IoTActionRole,
} from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { Permissions as SettingsPermissions } from '@bifravst/aws-ssm-settings-helpers/cdk'
import type { BackendLambdas } from '../packBackendLambdas.js'

/**
 * Resources that geo-location devices based on the LwM2M Connection Information
 */
export class ConnectionInformationGeoLocation extends Construct {
	public readonly table: DynamoDB.ITable
	constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
		}: {
			lambdaSources: Pick<BackendLambdas, 'connectionInformationGeoLocation'>
			layers: Array<Lambda.ILayerVersion>
		},
	) {
		super(parent, 'connection-information-geo-location')

		this.table = new DynamoDB.Table(this, 'table', {
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
			handler: lambdaSources.connectionInformationGeoLocation.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(60),
			memorySize: 1792,
			code: new LambdaSource(
				this,
				lambdaSources.connectionInformationGeoLocation,
			).code,
			description:
				'Resolve device geo location based on connection information',
			environment: {
				VERSION: this.node.getContext('version'),
				NODE_NO_WARNINGS: '1',
				BACKEND_STACK_NAME: STACK_NAME,
				CACHE_TABLE_NAME: this.table.tableName,
				DISABLE_METRICS: this.node.getContext('isTest') === true ? '1' : '0',
			},
			layers,
			...new LambdaLogGroup(this, 'fnLogs'),
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['iot:UpdateThingShadow'],
					resources: ['*'],
				}),
				SettingsPermissions(Stack.of(this)),
			],
		})
		this.table.grantWriteData(fn)

		const rule = new IoT.CfnTopicRule(this, 'topicRule', {
			topicRulePayload: {
				description: `Resolve device geo location based on connection information`,
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: [
					`SELECT`,
					`get(get(get(state, "reported"), "14203:1.0"), "0") as connectionInformation,`,
					`topic(3) as id`,
					`from '$aws/things/+/shadow/name/lwm2m/update/accepted'`,
					`WHERE isUndefined(get(get(get(state, "reported"), "14203:1.0"), "0")) = False`,
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
