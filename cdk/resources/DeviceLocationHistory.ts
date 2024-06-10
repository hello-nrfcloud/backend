import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { aws_lambda as Lambda } from 'aws-cdk-lib'
import {
	Duration,
	aws_dynamodb as DynamoDB,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_lambda_event_sources as EventSources,
	RemovalPolicy,
	aws_iam as IAM,
	aws_sqs as SQS,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { WebsocketConnectionsTable } from './WebsocketConnectionsTable.js'
import type { LwM2MObjectsHistory } from './LwM2MObjectsHistory.js'
import type { WebsocketEventBus } from './WebsocketEventBus.js'

/**
 * Updates the location history for each device from nRF Cloud
 */
export class DeviceLocationHistory extends Construct {
	public scheduleFetches: PackedLambdaFn
	public fetcher: PackedLambdaFn
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			connectionsTable,
			lwm2mHistory,
			websocketEventBus,
		}: {
			lambdaSources: Pick<
				BackendLambdas,
				'scheduleLocationFetchHistory' | 'fetchLocationHistory'
			>
			layers: Lambda.ILayerVersion[]
			connectionsTable: WebsocketConnectionsTable
			lwm2mHistory: LwM2MObjectsHistory
			websocketEventBus: WebsocketEventBus
		},
	) {
		super(parent, 'DeviceLocationHistory')

		const locationHistorySyncTable = new DynamoDB.Table(
			this,
			'locationHistorySyncTable',
			{
				billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
				partitionKey: {
					name: 'deviceId',
					type: DynamoDB.AttributeType.STRING,
				},
				removalPolicy: RemovalPolicy.DESTROY,
			},
		)

		const scheduleDuration = Duration.seconds(60)

		// The scheduleFetches puts location history fetch tasks in this queue
		const workQueue = new SQS.Queue(this, 'workQueue', {
			retentionPeriod: scheduleDuration,
			removalPolicy: RemovalPolicy.DESTROY,
			visibilityTimeout: scheduleDuration,
		})
		this.scheduleFetches = new PackedLambdaFn(
			this,
			'scheduleLocationFetchHistory',
			lambdaSources.scheduleLocationFetchHistory,
			{
				description:
					'Schedule fetching of the location history for currently observed devices',
				environment: {
					LOCATION_HISTORY_SYNC_TABLE_NAME: locationHistorySyncTable.tableName,
					WORK_QUEUE_URL: workQueue.queueUrl,
					WEBSOCKET_CONNECTIONS_TABLE_NAME: connectionsTable.table.tableName,
					MAX_AGE_HOURS:
						lwm2mHistory.memoryStoreRetentionPeriodInHours.toString(),
				},
				layers,
				timeout: Duration.seconds(10),
			},
		)
		locationHistorySyncTable.grantReadWriteData(this.scheduleFetches.fn)
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
					'Fetch the location history and write it to TimeStream and the device shadow',
				environment: {
					HISTORICAL_DATA_TABLE_INFO: lwm2mHistory.table.ref,
					EVENTBUS_NAME: websocketEventBus.eventBus.eventBusName,
				},
				layers,
				timeout: Duration.minutes(1),
				initialPolicy: [
					new IAM.PolicyStatement({
						actions: ['iot:UpdateThingShadow'],
						resources: ['*'],
					}),
					new IAM.PolicyStatement({
						actions: ['timestream:WriteRecords'],
						resources: [lwm2mHistory.table.attrArn],
					}),
					new IAM.PolicyStatement({
						actions: ['timestream:DescribeEndpoints'],
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
	}
}
