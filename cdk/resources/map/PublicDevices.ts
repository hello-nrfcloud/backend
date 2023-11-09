import { Construct } from 'constructs'
import {
	aws_lambda as Lambda,
	aws_iam as IAM,
	aws_dynamodb as DynamoDB,
	aws_logs as Logs,
	aws_iot as IoT,
	RemovalPolicy,
	Duration,
	Stack,
} from 'aws-cdk-lib'
import type { PackedLambda } from '../../helpers/lambdas/packLambda'

/**
 * Contains the resources to manage the information about public devices
 */
export class PublicDevices extends Construct {
	constructor(
		parent: Construct,
		{
			mapLayer,
			lambdaSources,
		}: {
			mapLayer: Lambda.ILayerVersion
			lambdaSources: {
				updatesToLwM2M: PackedLambda
				iotRulePublicDeviceCheck: PackedLambda
			}
		},
	) {
		super(parent, 'public-devices')

		// This table records the user consent for a certain device to be public
		const table = new DynamoDB.Table(this, 'devices', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'id',
				type: DynamoDB.AttributeType.STRING,
			},
			timeToLiveAttribute: 'ttl',
			removalPolicy: RemovalPolicy.DESTROY,
		})

		const iotRulePublicDeviceCheck = new Lambda.Function(
			this,
			'iotRulePublicDeviceCheck',
			{
				handler: lambdaSources.iotRulePublicDeviceCheck.handler,
				architecture: Lambda.Architecture.ARM_64,
				runtime: Lambda.Runtime.NODEJS_18_X,
				timeout: Duration.minutes(15),
				memorySize: 1792,
				code: Lambda.Code.fromAsset(
					lambdaSources.iotRulePublicDeviceCheck.zipFile,
				),
				description:
					'Invoked by the IoT Rule to check whether data from this device can be published.',
				layers: [mapLayer],
				environment: {
					VERSION: this.node.tryGetContext('version'),
					TABLE_NAME: table.tableName,
				},
				logRetention: Logs.RetentionDays.ONE_WEEK,
			},
		)
		table.grantReadData(iotRulePublicDeviceCheck)

		const updatesToLwM2M = new Lambda.Function(this, 'updatesToLwM2M', {
			handler: lambdaSources.updatesToLwM2M.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.minutes(15),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.updatesToLwM2M.zipFile),
			description:
				'Store shadow updates asset_tracker_v2 shadow format as LwM2M objects in a named shadow.',
			layers: [mapLayer],
			environment: {
				VERSION: this.node.tryGetContext('version'),
			},
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['iot:UpdateThingShadow'],
					resources: ['*'],
				}),
			],
			logRetention: Logs.RetentionDays.ONE_WEEK,
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
					`SELECT * as update,`,
					`aws_lambda("${iotRulePublicDeviceCheck.functionArn}", {"payload":topic(3)}) as deviceConsent`,
					`topic(3) as deviceId`,
					`FROM '$aws/things/+/shadow/update'`,
					`WHERE deviceConsent.public = True`,
				].join(' '),
				actions: [
					{
						lambda: {
							functionArn: iotRulePublicDeviceCheck.functionArn,
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

		iotRulePublicDeviceCheck.addPermission('invokeByRule', {
			principal: new IAM.ServicePrincipal(
				'iot.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: rule.attrArn,
		})

		updatesToLwM2M.addPermission('invokeByRule', {
			principal: new IAM.ServicePrincipal(
				'iot.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: rule.attrArn,
		})
	}
}
