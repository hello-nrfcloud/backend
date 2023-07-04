import {
	aws_dynamodb as DynamoDB,
	aws_iam as IAM,
	aws_iot as IoT,
	RemovalPolicy,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

/**
 * Record the timestamp when the device was last seen
 */
export class LastSeen extends Construct {
	public readonly table: DynamoDB.ITable
	public constructor(parent: Construct) {
		super(parent, 'lastSeen')

		this.table = new DynamoDB.Table(this, 'table', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'deviceId',
				type: DynamoDB.AttributeType.STRING,
			},
			sortKey: {
				name: 'source',
				type: DynamoDB.AttributeType.STRING,
			},
			pointInTimeRecovery: true,
			removalPolicy: RemovalPolicy.DESTROY,
		})

		const role = new IAM.Role(this, 'role', {
			assumedBy: new IAM.ServicePrincipal(
				'iot.amazonaws.com',
			) as IAM.IPrincipal,
			inlinePolicies: {
				rootPermissions: new IAM.PolicyDocument({
					statements: [
						new IAM.PolicyStatement({
							actions: ['iot:Publish'],
							resources: [
								`arn:aws:iot:${Stack.of(this).region}:${
									Stack.of(this).account
								}:topic/errors`,
							],
						}),
					],
				}),
			},
		})
		this.table.grantWriteData(role)

		new IoT.CfnTopicRule(this, 'rule', {
			topicRulePayload: {
				description: `Record the timestamp when a device last sent in messages`,
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: `
					select
						topic(4) as deviceId,
						'deviceMessage' as source,
						parse_time("yyyy-MM-dd'T'HH:mm:ss.S'Z'", ts) as lastSeen
					from 'data/+/+/+/+'
					where messageType = 'DATA'
				`,
				actions: [
					{
						dynamoDBv2: {
							putItem: {
								tableName: this.table.tableName,
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
