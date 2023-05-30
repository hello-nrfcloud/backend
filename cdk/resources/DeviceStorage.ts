import { aws_dynamodb as DynamoDB, RemovalPolicy, Stack } from 'aws-cdk-lib'
import { Construct } from 'constructs'

export class DeviceStorage extends Construct {
	public readonly devicesTable: DynamoDB.Table
	public readonly devicesTableCodeIndexName = 'codeIndex'
	public constructor(parent: Stack) {
		super(parent, 'DevicesTable')

		this.devicesTable = new DynamoDB.Table(this, 'devicesTable', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'deviceId',
				type: DynamoDB.AttributeType.STRING,
			},
			removalPolicy: RemovalPolicy.RETAIN,
			pointInTimeRecovery: true,
		})
		this.devicesTable.addGlobalSecondaryIndex({
			indexName: this.devicesTableCodeIndexName,
			partitionKey: {
				name: 'code',
				type: DynamoDB.AttributeType.STRING,
			},
			sortKey: {
				name: 'deviceId',
				type: DynamoDB.AttributeType.STRING,
			},
			projectionType: DynamoDB.ProjectionType.ALL,
		})
	}
}
