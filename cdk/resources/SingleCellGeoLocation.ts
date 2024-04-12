import {
	IoTActionRole,
	LambdaLogGroup,
	LambdaSource,
} from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { Permissions as SettingsPermissions } from '@hello.nrfcloud.com/nrfcloud-api-helpers/cdk'
import {
	Duration,
	aws_dynamodb as DynamoDB,
	aws_iam as IAM,
	aws_iot as IoT,
	aws_lambda as Lambda,
	RemovalPolicy,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../BackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'
import type { WebsocketEventBus } from './WebsocketEventBus.js'

/**
 * Resolve device geo location based on network information
 */
export class SingleCellGeoLocation extends Construct {
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			websocketEventBus,
			deviceStorage,
		}: {
			websocketEventBus: WebsocketEventBus
			deviceStorage: DeviceStorage
			lambdaSources: Pick<BackendLambdas, 'resolveSingleCellGeoLocation'>
			layers: Lambda.ILayerVersion[]
		},
	) {
		super(parent, 'SingleCellGeoLocation')

		const table = new DynamoDB.Table(this, 'table', {
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
			handler: lambdaSources.resolveSingleCellGeoLocation.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(60),
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.resolveSingleCellGeoLocation)
				.code,
			description: 'Resolve device geo location based on network information',
			environment: {
				VERSION: this.node.getContext('version'),
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				EVENTBUS_NAME: websocketEventBus.eventBus.eventBusName,
				NODE_NO_WARNINGS: '1',
				DISABLE_METRICS: this.node.getContext('isTest') === true ? '1' : '0',
				STACK_NAME: Stack.of(this).stackName,
				DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				CACHE_TABLE_NAME: table.tableName,
			},
			layers,
			...new LambdaLogGroup(this, 'fnLogs'),
			initialPolicy: [SettingsPermissions(Stack.of(this))],
		})
		websocketEventBus.eventBus.grantPutEventsTo(fn)
		deviceStorage.devicesTable.grantReadData(fn)
		table.grantWriteData(fn)

		const rule = new IoT.CfnTopicRule(this, 'topicRule', {
			topicRulePayload: {
				description: `Resolve device geo location based on network information`,
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: `
					select
						* as message,
						topic(4) as deviceId,
						timestamp() as timestamp
					from 'data/+/+/+/+'
					where messageType = 'DATA'
					and appId = 'DEVICE'
				`,
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
