import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { FOTAJobStatus } from '@hello.nrfcloud.com/proto/hello'
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
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'
import { MultiBundleFOTAFlow } from './FOTA/MultiBundleFlow.js'
import type { WebsocketEventBus } from './WebsocketEventBus.js'

/**
 * Schedules FOTA jobs for devices
 */
export class DeviceFOTA extends Construct {
	public readonly scheduleFetches: PackedLambdaFn
	public readonly updater: PackedLambdaFn
	public readonly notifier: PackedLambdaFn
	public readonly getFOTAJobStatusFn: PackedLambdaFn
	public readonly listFOTABundles: PackedLambdaFn
	public readonly startMultiBundleFOTAFlow: PackedLambdaFn
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

		const jobTable = new DynamoDB.Table(this, 'jobTable', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'pk',
				type: DynamoDB.AttributeType.STRING,
			},
			removalPolicy: RemovalPolicy.DESTROY,
			stream: DynamoDB.StreamViewType.NEW_IMAGE,
			timeToLiveAttribute: 'ttl',
		})

		const nrfCloudJobStatusTable = new DynamoDB.Table(
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
		nrfCloudJobStatusTable.addGlobalSecondaryIndex({
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
		this.scheduleFetches = new PackedLambdaFn(
			this,
			'scheduleFOTAJobStatusUpdate',
			lambdaSources.scheduleFOTAJobStatusUpdate,
			{
				description: 'Schedule fetching of the FOTA job status',
				environment: {
					WORK_QUEUE_URL: workQueue.queueUrl,
					NRF_CLOUD_JOB_STATUS_TABLE_NAME: nrfCloudJobStatusTable.tableName,
					NRF_CLOUD_JOB_STATUS_TABLE_STATUS_INDEX_NAME: statusIndex,
					FRESH_INTERVAL_SECONDS:
						this.node.getContext('isTest') === true ? '10' : '60',
				},
				layers,
				timeout: Duration.seconds(10),
			},
		)
		nrfCloudJobStatusTable.grantReadWriteData(this.scheduleFetches.fn)

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
					NRF_CLOUD_JOB_STATUS_TABLE_NAME: nrfCloudJobStatusTable.tableName,
				},
				layers,
				timeout: Duration.minutes(1),
			},
		)
		nrfCloudJobStatusTable.grantWriteData(this.updater.fn)
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
			new EventSources.DynamoEventSource(jobTable, {
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
		websocketEventBus.eventBus.grantPutEventsTo(this.notifier.fn)

		// Return FOTA jobs per device
		const deviceIdIndex = 'deviceIdIndex'
		jobTable.addGlobalSecondaryIndex({
			indexName: deviceIdIndex,
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
					JOB_TABLE_NAME: jobTable.tableName,
					JOB_TABLE_DEVICE_ID_INDEX_NAME: deviceIdIndex,
					RESPONSE_CACHE_MAX_AGE:
						this.node.getContext('isTest') === true ? '0' : '60',
				},
				layers,
			},
		)
		deviceStorage.devicesTable.grantReadData(this.getFOTAJobStatusFn.fn)
		jobTable.grantReadData(this.getFOTAJobStatusFn.fn)

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

		// State machine to drive the multi-bundle flow
		const mbff = new MultiBundleFOTAFlow(this, {
			lambdas: lambdaSources.multiBundleFOTAFlow,
			layers,
			nrfCloudJobStatusTable,
		})
		this.startMultiBundleFOTAFlow = new PackedLambdaFn(
			this,
			'startMultiBundleFOTAFlow',
			lambdaSources.multiBundleFOTAFlow.start,
			{
				description: 'REST entry point that starts the multi-bundle FOTA flow',
				environment: {
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
					STATE_MACHINE_ARN: mbff.stateMachine.stateMachineArn,
					JOB_TABLE_NAME: jobTable.tableName,
					JOB_TABLE_DEVICE_ID_INDEX_NAME: deviceIdIndex,
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
		mbff.stateMachine.grantStartExecution(this.startMultiBundleFOTAFlow.fn)
		deviceStorage.devicesTable.grantReadData(this.startMultiBundleFOTAFlow.fn)
		jobTable.grantWriteData(this.startMultiBundleFOTAFlow.fn)
	}
}
