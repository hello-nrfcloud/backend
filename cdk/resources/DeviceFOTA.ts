import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import {
	Duration,
	aws_dynamodb as DynamoDB,
	aws_lambda_event_sources as EventSources,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_lambda as Lambda,
	RemovalPolicy,
	aws_sqs as SQS,
	aws_iam as IAM,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'
import type { WebsocketEventBus } from './WebsocketEventBus.js'

/**
 * Schedules FOTA jobs for devices
 */
export class DeviceFOTA extends Construct {
	public readonly scheduleFOTAJobFn: PackedLambdaFn
	public readonly scheduleFetches: PackedLambdaFn
	public readonly updater: PackedLambdaFn
	public readonly notifier: PackedLambdaFn
	public readonly getFOTAJobStatusFn: PackedLambdaFn
	public readonly listFOTABundles: PackedLambdaFn
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			deviceStorage,
			websocketEventBus,
		}: {
			lambdaSources: Pick<
				BackendLambdas,
				| 'scheduleFOTAJob'
				| 'getFOTAJobStatus'
				| 'scheduleFOTAJobStatusUpdate'
				| 'updateFOTAJobStatus'
				| 'notifyFOTAJobStatus'
				| 'listFOTABundles'
			>
			layers: Lambda.ILayerVersion[]
			deviceStorage: DeviceStorage
			websocketEventBus: WebsocketEventBus
		},
	) {
		super(parent, 'DeviceFOTA')

		const jobStatusTable = new DynamoDB.Table(this, 'jobStatusTable', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'jobId',
				type: DynamoDB.AttributeType.STRING,
			},
			removalPolicy: RemovalPolicy.DESTROY,
			stream: DynamoDB.StreamViewType.NEW_IMAGE,
			timeToLiveAttribute: 'ttl',
		})

		// Create a new FOTA job
		this.scheduleFOTAJobFn = new PackedLambdaFn(
			this,
			'scheduleFOTAJob',
			lambdaSources.scheduleFOTAJob,
			{
				description: 'Schedule device FOTA jobs',
				environment: {
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
					JOB_STATUS_TABLE_NAME: jobStatusTable.tableName,
				},
				layers,
				initialPolicy: [
					new IAM.PolicyStatement({
						actions: ['iot:GetThingShadow'],
						resources: ['*'],
					}),
				],
			},
		)
		deviceStorage.devicesTable.grantReadData(this.scheduleFOTAJobFn.fn)
		jobStatusTable.grantWriteData(this.scheduleFOTAJobFn.fn)

		// The scheduleFetches puts location history fetch tasks in this queue
		const scheduleDuration = Duration.seconds(60)
		const statusIndex = 'statusIndex'
		jobStatusTable.addGlobalSecondaryIndex({
			indexName: statusIndex,
			partitionKey: {
				name: 'status',
				type: DynamoDB.AttributeType.STRING,
			},
			sortKey: {
				name: 'nextUpdateAt',
				type: DynamoDB.AttributeType.STRING,
			},
			projectionType: DynamoDB.ProjectionType.INCLUDE,
			nonKeyAttributes: ['createdAt'],
		})
		const workQueue = new SQS.Queue(this, 'workQueue', {
			retentionPeriod: scheduleDuration,
			removalPolicy: RemovalPolicy.DESTROY,
			visibilityTimeout: scheduleDuration,
		})
		this.scheduleFetches = new PackedLambdaFn(
			this,
			'scheduleFOTAJobStatusUpdate',
			lambdaSources.scheduleFOTAJobStatusUpdate,
			{
				description: 'Schedule fetching of the FOTA job status',
				environment: {
					WORK_QUEUE_URL: workQueue.queueUrl,
					JOB_STATUS_TABLE_NAME: jobStatusTable.tableName,
					JOB_STATUS_TABLE_STATUS_INDEX_NAME: statusIndex,
					FRESH_INTERVAL_SECONDS:
						this.node.getContext('isTest') === true ? '10' : '60',
				},
				layers,
				timeout: Duration.seconds(10),
			},
		)
		jobStatusTable.grantReadWriteData(this.scheduleFetches.fn)

		const scheduler = new Events.Rule(this, 'scheduler', {
			schedule: Events.Schedule.rate(scheduleDuration),
		})
		scheduler.addTarget(
			new EventTargets.LambdaFunction(this.scheduleFetches.fn),
		)
		workQueue.grantSendMessages(this.scheduleFetches.fn)

		// The updater reads tasks from the work queue and updates the FOTA job status
		this.updater = new PackedLambdaFn(
			this,
			'updateFOTAJobStatus',
			lambdaSources.updateFOTAJobStatus,
			{
				description:
					'Fetch the FOTA job status and write to the dynamoDB table',
				environment: {
					JOB_STATUS_TABLE_NAME: jobStatusTable.tableName,
				},
				layers,
				timeout: Duration.minutes(1),
			},
		)
		jobStatusTable.grantWriteData(this.updater.fn)
		this.updater.fn.addEventSource(
			new EventSources.SqsEventSource(workQueue, {
				batchSize: 10,
				maxConcurrency: 10,
			}),
		)
		websocketEventBus.eventBus.grantPutEventsTo(this.updater.fn)

		// Publish notifications about completed FOTA jobs to the websocket
		this.notifier = new PackedLambdaFn(
			this,
			'notifyFOTAJobStatus',
			lambdaSources.notifyFOTAJobStatus,
			{
				description:
					'Publishes notifications about completed FOTA jobs to the websocket',
				environment: {
					EVENTBUS_NAME: websocketEventBus.eventBus.eventBusName,
				},
				layers,
				timeout: Duration.minutes(1),
			},
		)
		this.notifier.fn.addEventSource(
			new EventSources.DynamoEventSource(jobStatusTable, {
				startingPosition: Lambda.StartingPosition.LATEST,
				filters: [
					Lambda.FilterCriteria.filter({
						dynamodb: {
							NewImage: {
								status: {
									S: [
										'FAILED',
										'SUCCEEDED',
										'TIMED_OUT',
										'CANCELLED',
										'REJECTED',
										'COMPLETED',
									],
								},
							},
						},
					}),
				],
			}),
		)
		websocketEventBus.eventBus.grantPutEventsTo(this.notifier.fn)

		// Return FOTA jobs per device
		const deviceIdIndex = 'deviceIdIndex'
		jobStatusTable.addGlobalSecondaryIndex({
			indexName: deviceIdIndex,
			partitionKey: {
				name: 'deviceId',
				type: DynamoDB.AttributeType.STRING,
			},
			sortKey: {
				name: 'lastUpdatedAt',
				type: DynamoDB.AttributeType.STRING,
			},
			projectionType: DynamoDB.ProjectionType.KEYS_ONLY,
		})
		this.getFOTAJobStatusFn = new PackedLambdaFn(
			this,
			'getFOTAJobStatus',
			lambdaSources.getFOTAJobStatus,
			{
				description: 'Return FOTA jobs per device',
				environment: {
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
					JOB_STATUS_TABLE_NAME: jobStatusTable.tableName,
					JOB_STATUS_TABLE_DEVICE_INDEX_NAME: deviceIdIndex,
					RESPONSE_CACHE_MAX_AGE:
						this.node.getContext('isTest') === true ? '0' : '60',
				},
				layers,
			},
		)
		deviceStorage.devicesTable.grantReadData(this.getFOTAJobStatusFn.fn)
		jobStatusTable.grantReadData(this.getFOTAJobStatusFn.fn)

		// List FOTA bundles
		this.listFOTABundles = new PackedLambdaFn(
			this,
			'listFOTABundles',
			lambdaSources.listFOTABundles,
			{
				description: 'List FOTA bundles',
				environment: {
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				},
				layers,
				timeout: Duration.seconds(10),
			},
		)
		deviceStorage.devicesTable.grantReadData(this.listFOTABundles.fn)
	}
}
