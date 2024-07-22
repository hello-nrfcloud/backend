import {
	aws_dynamodb as DynamoDB,
	aws_iot as IoT,
	RemovalPolicy,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { IoTActionRole } from '@bifravst/aws-cdk-lambda-helpers/cdk'

/**
 * Record the timestamp when the device was last seen
 *
 * Note: unfortunately there is no 'updateItem' action that could be used in the
 * rule action. So we have to track the last seen information in a separate table.
 */
export class DeviceLastSeen extends Construct {
	public readonly table: DynamoDB.Table
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
			pointInTimeRecovery: false,
			removalPolicy: RemovalPolicy.DESTROY,
		})

		// Used for the unique active devices per day KPI
		this.table.addGlobalSecondaryIndex({
			indexName: 'dailyActive',
			partitionKey: {
				name: 'source',
				type: DynamoDB.AttributeType.STRING,
			},
			sortKey: {
				name: 'day',
				type: DynamoDB.AttributeType.STRING,
			},
			projectionType: DynamoDB.ProjectionType.KEYS_ONLY,
		})

		const role = new IoTActionRole(this).role
		this.table.grantWriteData(role)

		new IoT.CfnTopicRule(this, 'rule', {
			topicRulePayload: {
				description: `Record the timestamp when a device last sent in messages based on incoming CoAP RAW messages`,
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: [
					`select`,
					`topic(4) as deviceId,`,
					`'deviceMessage' as source,`,
					`parse_time("yyyy-MM-dd'T'HH:mm:ss.S'Z'", timestamp()) as lastSeen,`,
					// Used for the unique active devices per day KPI
					`parse_time("yyyy-MM-dd", timestamp()) as day`,
					`from 'data/m/d/+/d2c/raw'`,
				].join(' '),
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
