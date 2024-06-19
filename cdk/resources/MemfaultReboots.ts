import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import {
	Duration,
	aws_dynamodb as DynamoDB,
	aws_lambda_event_sources as EventSources,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_iam as IAM,
	type aws_lambda as Lambda,
	RemovalPolicy,
	aws_sqs as SQS,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'
import type { WebsocketConnectionsTable } from './WebsocketConnectionsTable.js'
import type { WebsocketEventBus } from './WebsocketEventBus.js'

/**
 * Makes the Memfault reboots available to the frontend
 */
export class MemfaultReboots extends Construct {
	public scheduleFetches: PackedLambdaFn
	public fetcher: PackedLambdaFn
	public queryFn: PackedLambdaFn
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			connectionsTable,
			websocketEventBus,
			deviceStorage,
		}: {
			lambdaSources: Pick<
				BackendLambdas,
				| 'scheduleFetchMemfaultReboots'
				| 'fetchMemfaultReboots'
				| 'queryMemfaultReboots'
			>
			layers: Lambda.ILayerVersion[]
			connectionsTable: WebsocketConnectionsTable
			websocketEventBus: WebsocketEventBus
			deviceStorage: DeviceStorage
		},
	) {
		super(parent, 'MemfaultReboots')

		const syncTable = new DynamoDB.Table(this, 'syncTable', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'deviceId',
				type: DynamoDB.AttributeType.STRING,
			},
			removalPolicy: RemovalPolicy.DESTROY,
		})

		const rebootsTable = new DynamoDB.Table(this, 'rebootsTable', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'deviceId',
				type: DynamoDB.AttributeType.STRING,
			},
			sortKey: {
				name: 'timestamp',
				type: DynamoDB.AttributeType.STRING,
			},
			timeToLiveAttribute: 'ttl',
			removalPolicy: RemovalPolicy.DESTROY,
		})

		const scheduleDuration =
			this.node.getContext('isTest') === true
				? Duration.minutes(1)
				: Duration.minutes(5)

		// The scheduleFetches puts device reboots fetch tasks in this queue
		const workQueue = new SQS.Queue(this, 'workQueue', {
			retentionPeriod: scheduleDuration,
			removalPolicy: RemovalPolicy.DESTROY,
			visibilityTimeout: scheduleDuration,
		})
		this.scheduleFetches = new PackedLambdaFn(
			this,
			'scheduleFetchMemfaultReboots',
			lambdaSources.scheduleFetchMemfaultReboots,
			{
				description:
					'Schedule fetching of the device reboots for currently observed devices',
				environment: {
					SYNC_TABLE_NAME: syncTable.tableName,
					WORK_QUEUE_URL: workQueue.queueUrl,
					WEBSOCKET_CONNECTIONS_TABLE_NAME: connectionsTable.table.tableName,
					MAX_AGE_HOURS: '24',
				},
				layers,
				timeout: Duration.seconds(10),
			},
		)
		syncTable.grantReadWriteData(this.scheduleFetches.fn)
		connectionsTable.table.grantReadWriteData(this.scheduleFetches.fn)

		const scheduler = new Events.Rule(this, 'scheduler', {
			schedule: Events.Schedule.rate(scheduleDuration),
		})
		scheduler.addTarget(
			new EventTargets.LambdaFunction(this.scheduleFetches.fn),
		)
		workQueue.grantSendMessages(this.scheduleFetches.fn)

		// The fetcher reads tasks from the work queue and fetches the device reboots
		this.fetcher = new PackedLambdaFn(
			this,
			'fetchMemfaultReboots',
			lambdaSources.fetchMemfaultReboots,
			{
				description:
					'Fetch the device reboots and write it to the history table and the device shadow',
				environment: {
					TABLE_NAME: rebootsTable.tableName,
					EVENTBUS_NAME: websocketEventBus.eventBus.eventBusName,
				},
				layers,
				timeout: Duration.minutes(1),
				initialPolicy: [
					new IAM.PolicyStatement({
						actions: ['iot:UpdateThingShadow'],
						resources: ['*'],
					}),
				],
			},
		)
		this.fetcher.fn.addEventSource(
			new EventSources.SqsEventSource(workQueue, {
				batchSize: 1,
				maxConcurrency: 10,
			}),
		)
		websocketEventBus.eventBus.grantPutEventsTo(this.fetcher.fn)
		rebootsTable.grantWriteData(this.fetcher.fn)

		this.queryFn = new PackedLambdaFn(
			this,
			'queryFn',
			lambdaSources.queryMemfaultReboots,
			{
				timeout: Duration.seconds(10),
				description: 'Queries the device reboots',
				layers,
				environment: {
					TABLE_NAME: rebootsTable.tableName,
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				},
			},
		)
		deviceStorage.devicesTable.grantReadData(this.queryFn.fn)
		rebootsTable.grantReadData(this.queryFn.fn)
	}
}
