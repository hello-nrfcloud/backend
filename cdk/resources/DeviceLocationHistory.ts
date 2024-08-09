import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { aws_lambda as Lambda } from 'aws-cdk-lib'
import {
	Duration,
	aws_dynamodb as DynamoDB,
	aws_events as Events,
	aws_lambda_event_sources as EventSources,
	aws_events_targets as EventTargets,
	aws_iam as IAM,
	RemovalPolicy,
	aws_sqs as SQS,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'
import type { WebsocketConnectionsTable } from './WebsocketConnectionsTable.js'
import type { WebsocketEventBus } from './WebsocketEventBus.js'

/**
 * Makes the device location history available to the frontend
 */
export class DeviceLocationHistory extends Construct {
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
				| 'scheduleFetchLocationHistory'
				| 'fetchLocationHistory'
				| 'queryLocationHistory'
			>
			layers: Lambda.ILayerVersion[]
			connectionsTable: WebsocketConnectionsTable
			websocketEventBus: WebsocketEventBus
			deviceStorage: DeviceStorage
		},
	) {
		super(parent, 'DeviceLocationHistory')

		const syncTable = new DynamoDB.Table(this, 'locationHistorySyncTable', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'deviceId',
				type: DynamoDB.AttributeType.STRING,
			},
			removalPolicy: RemovalPolicy.DESTROY,
		})

		const historyTable = new DynamoDB.Table(this, 'locationHistoryTable', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'id',
				type: DynamoDB.AttributeType.STRING,
			},
			sortKey: {
				name: 'timestamp',
				type: DynamoDB.AttributeType.STRING,
			},
			timeToLiveAttribute: 'ttl',
			removalPolicy: RemovalPolicy.DESTROY,
		})

		const deviceIdTimestampIndex = 'deviceIdTimestampIndex'
		historyTable.addGlobalSecondaryIndex({
			indexName: deviceIdTimestampIndex,
			partitionKey: {
				name: 'deviceId',
				type: DynamoDB.AttributeType.STRING,
			},
			sortKey: {
				name: 'timestamp',
				type: DynamoDB.AttributeType.STRING,
			},
			projectionType: DynamoDB.ProjectionType.INCLUDE,
			nonKeyAttributes: ['source', 'lat', 'lon', 'uncertainty'],
		})

		const scheduleDuration = Duration.seconds(60)

		// The scheduleFetches puts location history fetch tasks in this queue
		const workQueue = new SQS.Queue(this, 'workQueue', {
			retentionPeriod: scheduleDuration,
			removalPolicy: RemovalPolicy.DESTROY,
			visibilityTimeout: scheduleDuration,
		})
		this.scheduleFetches = new PackedLambdaFn(
			this,
			'scheduleFetchLocationHistory',
			lambdaSources.scheduleFetchLocationHistory,
			{
				description:
					'Schedule fetching of the location history for currently observed devices',
				environment: {
					LOCATION_HISTORY_SYNC_TABLE_NAME: syncTable.tableName,
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

		// The fetcher reads tasks from the work queue and fetches the location history
		this.fetcher = new PackedLambdaFn(
			this,
			'fetchLocationHistory',
			lambdaSources.fetchLocationHistory,
			{
				description:
					'Fetch the location history and write it to the history table and the device shadow',
				environment: {
					LOCATION_HISTORY_TABLE_NAME: historyTable.tableName,
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
		historyTable.grantWriteData(this.fetcher.fn)

		this.queryFn = new PackedLambdaFn(
			this,
			'queryFn',
			lambdaSources.queryLocationHistory,
			{
				timeout: Duration.seconds(10),
				description: 'Queries the location history',
				layers,
				environment: {
					LOCATION_HISTORY_TABLE_NAME: historyTable.tableName,
					LOCATION_HISTORY_TABLE_DEVICE_ID_TIMESTAMP_INDEX:
						deviceIdTimestampIndex,
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				},
			},
		)
		deviceStorage.devicesTable.grantReadData(this.queryFn.fn)
		historyTable.grantReadData(this.queryFn.fn)
	}
}
