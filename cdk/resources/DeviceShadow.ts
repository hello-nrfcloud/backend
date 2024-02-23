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
import { LambdaSource } from './LambdaSource.js'
import { Scope } from '../../util/settings.js'
import type { WebsocketEventBus } from './WebsocketEventBus'
import type { WebsocketConnectionsTable } from './WebsocketConnectionsTable'
import { LambdaLogGroup } from './LambdaLogGroup.js'

export class DeviceShadow extends Construct {
	public readonly deviceShadowTable: DynamoDB.ITable
	public constructor(
		parent: Construct,
		{
			websocketEventBus,
			websocketConnectionsTable,
			lambdaSources,
			layers,
		}: {
			websocketEventBus: WebsocketEventBus
			websocketConnectionsTable: WebsocketConnectionsTable
			lambdaSources: {
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

		// Lambda functions
		const prepareDeviceShadow = new Lambda.Function(
			this,
			'prepareDeviceShadow',
			{
				handler: lambdaSources.prepareDeviceShadow.handler,
				architecture: Lambda.Architecture.ARM_64,
				runtime: Lambda.Runtime.NODEJS_20_X,
				timeout: Duration.seconds(5),
				memorySize: 1792,
				code: new LambdaSource(this, lambdaSources.prepareDeviceShadow).code,
				description: 'Generate queue to fetch the shadow data',
				environment: {
					VERSION: this.node.tryGetContext('version'),
					QUEUE_URL: shadowQueue.queueUrl,
					LOG_LEVEL: this.node.tryGetContext('logLevel'),
					NODE_NO_WARNINGS: '1',
					DISABLE_METRICS:
						this.node.tryGetContext('isTest') === true ? '1' : '0',
				},
				initialPolicy: [],
				layers,
				...new LambdaLogGroup(this, 'prepareDeviceShadowLogs'),
			},
		)
		scheduler.addTarget(new EventTargets.LambdaFunction(prepareDeviceShadow))
		shadowQueue.grantSendMessages(prepareDeviceShadow)

		const fetchDeviceShadow = new Lambda.Function(this, 'fetchDeviceShadow', {
			handler: lambdaSources.fetchDeviceShadow.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: processDeviceShadowTimeout,
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.fetchDeviceShadow).code,
			description: `Fetch devices' shadow from nRF Cloud`,
			environment: {
				VERSION: this.node.tryGetContext('version'),
				EVENTBUS_NAME: websocketEventBus.eventBus.eventBusName,
				WEBSOCKET_CONNECTIONS_TABLE_NAME:
					websocketConnectionsTable.table.tableName,
				LOCK_TABLE_NAME: lockTable.tableName,
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				STACK_NAME: Stack.of(this).stackName,
				NODE_NO_WARNINGS: '1',
				PARAMETERS_SECRETS_EXTENSION_CACHE_ENABLED: 'FALSE',
				PARAMETERS_SECRETS_EXTENSION_MAX_CONNECTIONS: '100',
				DISABLE_METRICS: this.node.tryGetContext('isTest') === true ? '1' : '0',
				DEVICE_SHADOW_TABLE_NAME: this.deviceShadowTable.tableName,
			},
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['ssm:GetParametersByPath', 'ssm:GetParameter'],
					resources: [
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/${
							Scope.NRFCLOUD_ACCOUNT_PREFIX
						}`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/${
							Scope.NRFCLOUD_ACCOUNT_PREFIX
						}/*`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/nRFCloud/accounts`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/nRFCloud/accounts/*`,
					],
				}),
			],
			layers,
			...new LambdaLogGroup(this, 'fetchDeviceShadowLogs'),
		})
		const ssmReadPolicy = new IAM.PolicyStatement({
			effect: IAM.Effect.ALLOW,
			actions: ['ssm:GetParametersByPath'],
			resources: [
				`arn:aws:ssm:${Stack.of(this).region}:${
					Stack.of(this).account
				}:parameter/${Stack.of(this).stackName}/stack/context`,
			],
		})
		fetchDeviceShadow.addToRolePolicy(ssmReadPolicy)
		websocketEventBus.eventBus.grantPutEventsTo(fetchDeviceShadow)
		websocketConnectionsTable.table.grantReadWriteData(fetchDeviceShadow)
		lockTable.grantReadWriteData(fetchDeviceShadow)
		fetchDeviceShadow.addEventSource(
			new EventSources.SqsEventSource(shadowQueue, {
				batchSize: 10,
				maxConcurrency: 15,
			}),
		)
		this.deviceShadowTable.grantWriteData(fetchDeviceShadow)
	}
}
