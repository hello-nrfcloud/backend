import { aws_dynamodb as DynamoDB, RemovalPolicy } from 'aws-cdk-lib'
import { Construct } from 'constructs'

/**
 * Contains the resources to manage the information about public devices
 */
export class PublicDevices extends Construct {
	public readonly publicDevicesTable: DynamoDB.Table
	public readonly publicDevicesTableModelOwnerConfirmedIndex =
		'modelOwnerConfirmedIndex'
	constructor(parent: Construct) {
		super(parent, 'public-devices')

		// This table records the user consent for a certain device to be public
		this.publicDevicesTable = new DynamoDB.Table(this, 'table', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'secret__deviceId',
				type: DynamoDB.AttributeType.STRING,
			},
			timeToLiveAttribute: 'ttl',
			removalPolicy: RemovalPolicy.DESTROY,
		})

		this.publicDevicesTable.addGlobalSecondaryIndex({
			indexName: this.publicDevicesTableModelOwnerConfirmedIndex,
			partitionKey: {
				name: 'model',
				type: DynamoDB.AttributeType.STRING,
			},
			sortKey: {
				name: 'ownerConfirmed',
				type: DynamoDB.AttributeType.STRING,
			},
			projectionType: DynamoDB.ProjectionType.INCLUDE,
			nonKeyAttributes: ['id'],
		})
	}
}
