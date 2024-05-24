import {
	IoTActionRole,
	PackedLambdaFn,
} from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { aws_lambda as Lambda } from 'aws-cdk-lib'
import {
	Duration,
	aws_dynamodb as DynamoDB,
	aws_iam as IAM,
	aws_iot as IoT,
	RemovalPolicy,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { WebsocketEventBus } from './WebsocketEventBus.js'

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
			websocketEventBus,
		}: {
			lambdaSources: Pick<BackendLambdas, 'connectionInformationGeoLocation'>
			layers: Array<Lambda.ILayerVersion>
			websocketEventBus: WebsocketEventBus
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

		const fn = new PackedLambdaFn(
			this,
			'fn',
			lambdaSources.connectionInformationGeoLocation,
			{
				timeout: Duration.seconds(60),
				description:
					'Resolve device geo location based on connection information',
				environment: {
					CACHE_TABLE_NAME: this.table.tableName,
					EVENTBUS_NAME: websocketEventBus.eventBus.eventBusName,
				},
				layers,
				initialPolicy: [
					new IAM.PolicyStatement({
						actions: ['iot:UpdateThingShadow'],
						resources: ['*'],
					}),
				],
			},
		).fn
		this.table.grantWriteData(fn)
		websocketEventBus.eventBus.grantPutEventsTo(fn)

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
