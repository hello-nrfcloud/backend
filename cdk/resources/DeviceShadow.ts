import {
	Duration,
	aws_dynamodb as DynamoDB,
	aws_lambda_event_sources as EventSources,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_iam as IAM,
	aws_lambda as Lambda,
	RemovalPolicy,
	aws_sqs as SQS,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { PackedLambda } from '../helpers/lambdas/packLambda'
import { STACK_NAME } from '../stacks/stackConfig.js'
import { LambdaLogGroup } from './LambdaLogGroup.js'
import type { WebsocketAPI } from './WebsocketAPI.js'

export class DeviceShadow extends Construct {
	private readonly devicesTableIndexName = 'model-updatedAt-index'
	public constructor(
		parent: Construct,
		{
			websocketAPI,
			lambdaSources,
			layers,
		}: {
			websocketAPI: WebsocketAPI
			lambdaSources: {
				onWebsocketConnectOrDisconnect: PackedLambda
				prepareDeviceShadow: PackedLambda
				fetchDeviceShadow: PackedLambda
			}
			layers: Lambda.ILayerVersion[]
		},
	) {
		super(parent, 'DeviceShadow')

		// The duration to allow lambda to process device shadow
		const processDeviceShadowTimeout = Duration.minutes(1)

		// Scheduler
		// The lower bound of event schedule is 60 seconds.
		// Therefore, to achieve the lower interval, we will use delayed queue along with event schedule
		const scheduleDuration = Duration.seconds(60)
		const scheduler = new Events.Rule(this, 'scheduler', {
			description: `Scheduler to fetch devices's shadow`,
			schedule: Events.Schedule.rate(scheduleDuration),
		})

		// Working queue to fetch device shadow
		const shadowQueue = new SQS.Queue(this, 'shadowQueue', {
			retentionPeriod: scheduleDuration,
			removalPolicy: RemovalPolicy.DESTROY,
			visibilityTimeout: processDeviceShadowTimeout,
		})

		// Distribution lock database
		// The reason why we need lock is the fact that the lower bound of SQS lambda invocation is 2
		const lockTable = new DynamoDB.Table(this, 'lockTable', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'lockName',
				type: DynamoDB.AttributeType.STRING,
			},
			removalPolicy: RemovalPolicy.DESTROY,
			timeToLiveAttribute: 'ttl',
		})

		// Tracking device database
		const devicesTable = new DynamoDB.Table(this, 'devicesTable', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'deviceId',
				type: DynamoDB.AttributeType.STRING,
			},
			sortKey: {
				name: 'connectionId',
				type: DynamoDB.AttributeType.STRING,
			},
			removalPolicy: RemovalPolicy.DESTROY,
		})
		// The staticKey will be the same for all records, then we can filter using updatedAt field
		devicesTable.addGlobalSecondaryIndex({
			indexName: this.devicesTableIndexName,
			partitionKey: {
				name: 'staticKey',
				type: DynamoDB.AttributeType.STRING,
			},
			sortKey: {
				name: 'updatedAt',
				type: DynamoDB.AttributeType.STRING,
			},
			projectionType: DynamoDB.ProjectionType.ALL,
		})

		// Lambda functions
		const onWebsocketConnectOrDisconnect = new Lambda.Function(
			this,
			'onWebsocketConnectOrDisconnect',
			{
				handler: lambdaSources.onWebsocketConnectOrDisconnect.handler,
				architecture: Lambda.Architecture.ARM_64,
				runtime: Lambda.Runtime.NODEJS_18_X,
				timeout: Duration.seconds(5),
				memorySize: 1792,
				code: Lambda.Code.fromAsset(
					lambdaSources.onWebsocketConnectOrDisconnect.zipFile,
				),
				description: 'Subscribe to device connection or disconnection',
				environment: {
					VERSION: this.node.tryGetContext('version'),
					DEVICES_TABLE_NAME: devicesTable.tableName,
					LOG_LEVEL: this.node.tryGetContext('logLevel'),
					NODE_NO_WARNINGS: '1',
				},
				initialPolicy: [],
				layers,
			},
		)
		new Events.Rule(this, 'connectOrDisconnectRule', {
			eventPattern: {
				source: ['thingy.ws'],
				detailType: ['disconnect', 'connect'],
			},
			targets: [
				new EventTargets.LambdaFunction(onWebsocketConnectOrDisconnect),
			],
			eventBus: websocketAPI.eventBus,
		})
		devicesTable.grantReadWriteData(onWebsocketConnectOrDisconnect)
		new LambdaLogGroup(
			this,
			'onWebsocketConnectOrDisconnectLog',
			onWebsocketConnectOrDisconnect,
		)

		const prepareDeviceShadow = new Lambda.Function(
			this,
			'prepareDeviceShadow',
			{
				handler: lambdaSources.prepareDeviceShadow.handler,
				architecture: Lambda.Architecture.ARM_64,
				runtime: Lambda.Runtime.NODEJS_18_X,
				timeout: Duration.seconds(5),
				memorySize: 1792,
				code: Lambda.Code.fromAsset(lambdaSources.prepareDeviceShadow.zipFile),
				description: 'Generate queue to fetch the shadow data',
				environment: {
					VERSION: this.node.tryGetContext('version'),
					QUEUE_URL: shadowQueue.queueUrl,
					LOG_LEVEL: this.node.tryGetContext('logLevel'),
					NODE_NO_WARNINGS: '1',
				},
				initialPolicy: [],
				layers,
			},
		)
		scheduler.addTarget(new EventTargets.LambdaFunction(prepareDeviceShadow))
		shadowQueue.grantSendMessages(prepareDeviceShadow)
		new LambdaLogGroup(this, 'prepareDeviceShadowLogs', prepareDeviceShadow)

		const fetchDeviceShadow = new Lambda.Function(this, 'fetchDeviceShadow', {
			handler: lambdaSources.fetchDeviceShadow.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: processDeviceShadowTimeout,
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.fetchDeviceShadow.zipFile),
			description: `Fetch devices' shadow from nRF Cloud`,
			environment: {
				VERSION: this.node.tryGetContext('version'),
				STACK_NAME,
				EVENTBUS_NAME: websocketAPI.eventBus.eventBusName,
				DEVICES_TABLE: devicesTable.tableName,
				DEVICES_INDEX_NAME: this.devicesTableIndexName,
				LOCK_TABLE: lockTable.tableName,
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				STACK_NAME: Stack.of(this).stackName,
				NODE_NO_WARNINGS: '1',
			},
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['ssm:GetParameter'],
					resources: [
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/thirdParty/nrfcloud/*`,
					],
				}),
			],
			layers,
		})
		const ssmReadPolicy = new IAM.PolicyStatement({
			effect: IAM.Effect.ALLOW,
			actions: ['ssm:GetParametersByPath'],
			resources: [
				`arn:aws:ssm:${parent.region}:${parent.account}:parameter/${STACK_NAME}/config/stack`,
			],
		})
		fetchDeviceShadow.addToRolePolicy(ssmReadPolicy)
		websocketAPI.eventBus.grantPutEventsTo(fetchDeviceShadow)
		devicesTable.grantReadWriteData(fetchDeviceShadow)
		lockTable.grantReadWriteData(fetchDeviceShadow)
		fetchDeviceShadow.addEventSource(
			new EventSources.SqsEventSource(shadowQueue, {
				batchSize: 10,
				maxConcurrency: 2,
			}),
		)
		new LambdaLogGroup(this, 'fetchDeviceShadowLogs', fetchDeviceShadow)
	}
}
