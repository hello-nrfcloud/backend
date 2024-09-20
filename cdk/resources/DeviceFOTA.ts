import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { FOTAJobStatus } from '@hello.nrfcloud.com/proto/hello'
import {
	Duration,
	aws_dynamodb as DynamoDB,
	aws_lambda_event_sources as EventSources,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_lambda as Lambda,
	aws_logs as Logs,
	RemovalPolicy,
	aws_sqs as SQS,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'
import type { WebsocketEventBus } from './WebsocketEventBus.js'

/**
 * Schedules FOTA jobs for devices
 */
export class DeviceFOTA extends Construct {
	public readonly listFOTABundles: PackedLambdaFn
	public readonly getFOTAJobStatusFn: PackedLambdaFn
	public readonly jobTable: DynamoDB.Table
	public readonly jobTableDeviceIdIndex: string
	public readonly nrfCloudJobStatusTable: DynamoDB.Table
	public readonly logGroup: Logs.ILogGroup

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
				| 'getFOTAJobStatus'
				| 'scheduleFOTAJobStatusUpdate'
				| 'updateFOTAJobStatus'
				| 'notifyFOTAJobStatus'
				| 'listFOTABundles'
				| 'multiBundleFOTAFlow'
			>
			layers: Lambda.ILayerVersion[]
			deviceStorage: DeviceStorage
			websocketEventBus: WebsocketEventBus
		},
	) {
		super(parent, 'DeviceFOTA')

		this.logGroup = new Logs.LogGroup(this, 'logGroup', {
			removalPolicy:
				this.node.getContext('isTest') === true
					? RemovalPolicy.DESTROY
					: RemovalPolicy.RETAIN,
			logGroupName: `/${Stack.of(this).stackName}/FOTA/`,
			retention: Logs.RetentionDays.ONE_MONTH,
			logGroupClass: Logs.LogGroupClass.STANDARD, // INFREQUENT_ACCESS does not support custom metrics
		})

		this.jobTable = new DynamoDB.Table(this, 'jobTable', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'pk',
				type: DynamoDB.AttributeType.STRING,
			},
			removalPolicy: RemovalPolicy.DESTROY,
			stream: DynamoDB.StreamViewType.NEW_IMAGE,
			timeToLiveAttribute: 'ttl',
		})

		this.nrfCloudJobStatusTable = new DynamoDB.Table(
			this,
			'nrfCloudJobStatusTable',
			{
				billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
				partitionKey: {
					name: 'jobId',
					type: DynamoDB.AttributeType.STRING,
				},
				removalPolicy: RemovalPolicy.DESTROY,
				stream: DynamoDB.StreamViewType.NEW_IMAGE,
				timeToLiveAttribute: 'ttl',
			},
		)

		const scheduleDuration = Duration.seconds(60)
		const workQueue = new SQS.Queue(this, 'workQueue', {
			retentionPeriod: scheduleDuration,
			removalPolicy: RemovalPolicy.DESTROY,
			visibilityTimeout: scheduleDuration,
		})

		// The scheduleFetches puts job status fetch tasks in this queue
		const statusIndex = 'statusIndex'
		this.nrfCloudJobStatusTable.addGlobalSecondaryIndex({
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
		const scheduleFetches = new PackedLambdaFn(
			this,
			'scheduleFOTAJobStatusUpdate',
			lambdaSources.scheduleFOTAJobStatusUpdate,
			{
				description: 'Schedule fetching of the FOTA job status',
				environment: {
					WORK_QUEUE_URL: workQueue.queueUrl,
					NRF_CLOUD_JOB_STATUS_TABLE_NAME:
						this.nrfCloudJobStatusTable.tableName,
					NRF_CLOUD_JOB_STATUS_TABLE_STATUS_INDEX_NAME: statusIndex,
					FRESH_INTERVAL_SECONDS:
						this.node.getContext('isTest') === true ? '10' : '60',
				},
				layers,
				timeout: Duration.seconds(10),
				logGroup: this.logGroup,
			},
		)
		this.nrfCloudJobStatusTable.grantReadWriteData(scheduleFetches.fn)

		const scheduler = new Events.Rule(this, 'scheduler', {
			schedule: Events.Schedule.rate(scheduleDuration),
		})
		scheduler.addTarget(new EventTargets.LambdaFunction(scheduleFetches.fn))
		workQueue.grantSendMessages(scheduleFetches.fn)

		// The updater reads tasks from the work queue and updates the FOTA job status
		const updater = new PackedLambdaFn(
			this,
			'updateFOTAJobStatus',
			lambdaSources.updateFOTAJobStatus,
			{
				description:
					'Fetch the FOTA job status and write to the dynamoDB table',
				environment: {
					NRF_CLOUD_JOB_STATUS_TABLE_NAME:
						this.nrfCloudJobStatusTable.tableName,
				},
				layers,
				timeout: Duration.minutes(1),
				logGroup: this.logGroup,
			},
		)
		this.nrfCloudJobStatusTable.grantWriteData(updater.fn)
		updater.fn.addEventSource(
			new EventSources.SqsEventSource(workQueue, {
				batchSize: 10,
				maxConcurrency: 10,
			}),
		)
		websocketEventBus.eventBus.grantPutEventsTo(updater.fn)

		// Publish notifications about completed FOTA jobs to the websocket
		const notifier = new PackedLambdaFn(
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
				logGroup: this.logGroup,
			},
		)
		notifier.fn.addEventSource(
			new EventSources.DynamoEventSource(this.jobTable, {
				startingPosition: Lambda.StartingPosition.LATEST,
				filters: [
					Lambda.FilterCriteria.filter({
						dynamodb: {
							NewImage: {
								status: {
									S: [
										FOTAJobStatus.FAILED,
										FOTAJobStatus.SUCCEEDED,
										FOTAJobStatus.IN_PROGRESS,
									],
								},
							},
						},
					}),
				],
			}),
		)
		websocketEventBus.eventBus.grantPutEventsTo(notifier.fn)

		// Return FOTA jobs per device
		this.jobTableDeviceIdIndex = 'deviceIdIndex'
		this.jobTable.addGlobalSecondaryIndex({
			indexName: this.jobTableDeviceIdIndex,
			partitionKey: {
				name: 'deviceId',
				type: DynamoDB.AttributeType.STRING,
			},
			sortKey: {
				name: 'timestamp',
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
					JOB_TABLE_NAME: this.jobTable.tableName,
					JOB_TABLE_DEVICE_ID_INDEX_NAME: this.jobTableDeviceIdIndex,
					RESPONSE_CACHE_MAX_AGE:
						this.node.getContext('isTest') === true ? '0' : '60',
				},
				layers,
				logGroup: this.logGroup,
			},
		)
		deviceStorage.devicesTable.grantReadData(this.getFOTAJobStatusFn.fn)
		this.jobTable.grantReadData(this.getFOTAJobStatusFn.fn)

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
				logGroup: this.logGroup,
			},
		)
		deviceStorage.devicesTable.grantReadData(this.listFOTABundles.fn)
	}
}
