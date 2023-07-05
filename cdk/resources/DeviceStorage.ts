import { aws_dynamodb as DynamoDB, RemovalPolicy } from 'aws-cdk-lib'
import { Construct } from 'constructs'

export class DeviceStorage extends Construct {
	public readonly devicesTable: DynamoDB.Table
	public readonly devicesTableFingerprintIndexName = 'fingerprintIndex'
	public constructor(parent: Construct) {
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
			indexName: this.devicesTableFingerprintIndexName,
			partitionKey: {
				name: 'fingerprint',
				type: DynamoDB.AttributeType.STRING,
			},
			sortKey: {
				name: 'deviceId',
				type: DynamoDB.AttributeType.STRING,
			},
			projectionType: DynamoDB.ProjectionType.ALL,
		})

		// Used for the unique active fingerprints per day KPI
		this.devicesTable.addGlobalSecondaryIndex({
			indexName: 'dailyActive',
			partitionKey: {
				name: 'dailyActive__source',
				type: DynamoDB.AttributeType.STRING,
			},
			sortKey: {
				name: 'dailyActive__day',
				type: DynamoDB.AttributeType.STRING,
			},
			projectionType: DynamoDB.ProjectionType.KEYS_ONLY,
		})
	}
}
