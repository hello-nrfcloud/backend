import { aws_dynamodb as DynamoDB, RemovalPolicy } from 'aws-cdk-lib'
import { Construct } from 'constructs'

export class DeviceShadow extends Construct {
	public readonly deviceShadowTable: DynamoDB.ITable
	public constructor(parent: Construct) {
		super(parent, 'DeviceShadow')

		// Table to store the last known shadow of a device
		this.deviceShadowTable = new DynamoDB.Table(this, 'deviceShadow', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'deviceId',
				type: DynamoDB.AttributeType.STRING,
			},
			pointInTimeRecovery: false,
			removalPolicy: RemovalPolicy.DESTROY,
			timeToLiveAttribute: 'ttl',
		})
	}
}
