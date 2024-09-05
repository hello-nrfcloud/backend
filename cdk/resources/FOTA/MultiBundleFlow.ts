import type { PackedLambda } from '@bifravst/aws-cdk-lambda-helpers'
import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { FOTAJobStatus as nRFCloudFOTAJobStatus } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { FOTAJobStatus } from '@hello.nrfcloud.com/proto/hello'
import {
	Duration,
	aws_lambda_event_sources as EventSources,
	aws_iam as IAM,
	aws_lambda as Lambda,
	aws_stepfunctions_tasks as StepFunctionsTasks,
} from 'aws-cdk-lib'
import {
	Choice,
	Condition,
	DefinitionBody,
	IntegrationPattern,
	JsonPath,
	Pass,
	StateMachine,
	StateMachineType,
	Succeed,
	TaskInput,
	Timeout,
	type IStateMachine,
} from 'aws-cdk-lib/aws-stepfunctions'
import {
	DynamoAttributeValue,
	type LambdaInvoke,
} from 'aws-cdk-lib/aws-stepfunctions-tasks'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../../packBackendLambdas.js'
import type { DeviceFOTA } from '../DeviceFOTA.js'
import type { DeviceStorage } from '../DeviceStorage.js'

/**
 * This implements a state machine to drive a the multi-bundle flow where
 * multiple delta updates are be applied instead of one full update in order to
 * save the amount of data that needs to be transferred.
 */
export class MultiBundleFOTAFlow extends Construct {
	public readonly stateMachine: IStateMachine
	public readonly GetDeviceFirmwareDetails: PackedLambdaFn
	public readonly GetNextBundle: PackedLambdaFn
	public readonly CreateFOTAJob: PackedLambdaFn
	public readonly WaitForFOTAJobCompletionCallback: PackedLambdaFn
	public readonly WaitForFOTAJobCompletion: PackedLambdaFn
	public readonly WaitForUpdateAppliedCallback: PackedLambdaFn
	public readonly startMultiBundleFOTAFlow: PackedLambdaFn

	public constructor(
		parent: Construct,
		{
			lambdas,
			layers,
			deviceStorage,
			deviceFOTA,
		}: {
			lambdas: BackendLambdas['multiBundleFOTAFlow']
			layers: Lambda.ILayerVersion[]
			deviceStorage: DeviceStorage
			deviceFOTA: DeviceFOTA
		},
	) {
		super(parent, 'MultiBundleFOTAFlow')

		const GetDeviceFirmwareDetails = new LambdaStep(
			this,
			'GetDeviceFirmwareDetails',
			{
				source: lambdas.getDeviceFirmwareDetails,
				layers,
				description: 'Get the firmware details of the device',
				resultPath: '$.deviceFirmwareDetails',
				initialPolicy: [
					new IAM.PolicyStatement({
						actions: ['iot:GetThingShadow'],
						resources: ['*'],
					}),
				],
			},
		)
		this.GetDeviceFirmwareDetails = GetDeviceFirmwareDetails.fn

		const GetNextBundle = new LambdaStep(this, 'GetNextBundle', {
			source: lambdas.getNextBundle,
			layers,
			description: 'Get the next bundle to apply',
			resultPath: '$.nextBundle',
		})
		this.GetNextBundle = GetNextBundle.fn

		const CreateFOTAJob = new LambdaStep(this, 'createFOTAJob', {
			source: lambdas.createFOTAJob,
			layers,
			description: 'Create the FOTA job on nRF Cloud',
			resultPath: '$.fotaJob',
			retry: true,
		})
		this.CreateFOTAJob = CreateFOTAJob.fn

		const WaitForFOTAJobCompletionCallback = new LambdaStep(
			this,
			'WaitForFOTAJobCompletionCallback',
			{
				source: lambdas.WaitForFOTAJobCompletionCallback,
				layers,
				description:
					'Records the callback token for the task waiting for the nRF Cloud FOTA job to complete',
				resultPath: '$.fotaJobStatus',
				waitForJobCompletion: true,
				environment: {
					NRF_CLOUD_JOB_STATUS_TABLE_NAME:
						deviceFOTA.nrfCloudJobStatusTable.tableName,
				},
			},
		)
		this.WaitForFOTAJobCompletionCallback = WaitForFOTAJobCompletionCallback.fn
		deviceFOTA.nrfCloudJobStatusTable.grantReadWriteData(
			this.WaitForFOTAJobCompletionCallback.fn,
		)

		const WaitForUpdateAppliedCallback = new LambdaStep(
			this,
			'WaitForUpdateAppliedCallback',
			{
				source: lambdas.waitForUpdateAppliedCallback,
				layers,
				description:
					'Records the callback token for the task waiting for the device to report the update version',
				resultPath: '$.updatedDeviceFirmwareDetails',
				waitForJobCompletion: true,
				environment: {
					NRF_CLOUD_JOB_STATUS_TABLE_NAME:
						deviceFOTA.nrfCloudJobStatusTable.tableName,
				},
			},
		)
		this.WaitForUpdateAppliedCallback = WaitForUpdateAppliedCallback.fn
		deviceFOTA.nrfCloudJobStatusTable.grantReadWriteData(
			this.WaitForUpdateAppliedCallback.fn,
		)

		const bundleLoop = GetNextBundle.task // Figure out the next bundle
		bundleLoop.next(
			new Choice(this, 'Found next bundle?')
				.when(
					Condition.isNotNull(`$.nextBundle.bundleId`),
					new Pass(this, 'updateUsedVersion', {
						comment: 'Update the usedVersions map.',
						parameters: {
							job: JsonPath.objectAt('$.job'),
							deviceFirmwareDetails: JsonPath.objectAt(
								'$.deviceFirmwareDetails',
							),
							nextBundle: JsonPath.objectAt('$.nextBundle'),
							upgradePath: JsonPath.objectAt('$.upgradePath'),
							deviceId: JsonPath.stringAt('$.deviceId'),
							account: JsonPath.stringAt('$.account'),
							reportedVersion: JsonPath.stringAt('$.reportedVersion'),
							usedVersions: JsonPath.jsonMerge(
								JsonPath.objectAt('$.usedVersions'),
								JsonPath.stringToJson(
									JsonPath.format(
										'\\{"{}":"{}"\\}',
										JsonPath.stringAt('$.reportedVersion'),
										JsonPath.stringAt('$.nextBundle.bundleId'),
									),
								),
							),
						},
					}).next(
						// Create the FOTA job on nRF Cloud for the bundle
						CreateFOTAJob.task.next(
							// Persist the job details so the job fetcher can poll the API
							new StepFunctionsTasks.DynamoPutItem(this, 'PersistJobDetails', {
								table: deviceFOTA.nrfCloudJobStatusTable,
								item: {
									jobId: DynamoAttributeValue.fromString(
										JsonPath.stringAt('$.fotaJob.jobId'),
									),
									status: DynamoAttributeValue.fromString(
										nRFCloudFOTAJobStatus.QUEUED,
									),
									account: DynamoAttributeValue.fromString(
										JsonPath.stringAt('$.account'),
									),
									lastUpdatedAt: DynamoAttributeValue.fromString(
										JsonPath.stateEnteredTime,
									),
									createdAt: DynamoAttributeValue.fromString(
										JsonPath.stateEnteredTime,
									),
									nextUpdateAt: DynamoAttributeValue.fromString(
										JsonPath.stateEnteredTime,
									),
								},
								resultPath: '$.DynamoDB',
							}).next(
								new StepFunctionsTasks.DynamoUpdateItem(this, 'UpdateJob', {
									comment: 'Update the job status to IN_PROGRESS',
									table: deviceFOTA.jobTable,
									key: {
										pk: DynamoAttributeValue.fromString(
											JsonPath.stringAt('$.job.pk'),
										),
									},
									updateExpression:
										'SET #status = :status, #statusDetail = :statusDetail',
									expressionAttributeNames: {
										'#status': 'status',
										'#statusDetail': 'statusDetail',
									},
									expressionAttributeValues: {
										':status': DynamoAttributeValue.fromString(
											FOTAJobStatus.IN_PROGRESS,
										),
										':statusDetail': DynamoAttributeValue.fromString(
											JsonPath.format(
												`Started job for version {} with bundle {}.`,
												JsonPath.stringAt('$.reportedVersion'),
												JsonPath.stringAt('$.nextBundle.bundleId'),
											),
										),
									},
									resultPath: '$.DynamoDB',
								}).next(
									WaitForFOTAJobCompletionCallback.task.next(
										WaitForUpdateAppliedCallback.task.next(
											new Pass(this, 'updateReportedVersion', {
												parameters: {
													appVersion: JsonPath.stringAt(
														'$.updatedDeviceFirmwareDetails.appVersion',
													),
													mfwVersion: JsonPath.stringAt(
														'$.updatedDeviceFirmwareDetails.mfwVersion',
													),
													supportedFOTATypes: JsonPath.listAt(
														'$.updatedDeviceFirmwareDetails.supportedFOTATypes',
													),
												},
												comment: 'Update the version reported by the device.',
												resultPath: '$.	deviceFirmwareDetails',
											}).next(bundleLoop),
										),
									),
								),
							),
						),
					),
				)
				.otherwise(
					new Succeed(this, 'noMoreUpdates', {
						comment: 'No further update defined.',
					}),
				),
		)

		this.stateMachine = new StateMachine(this, 'StateMachine', {
			comment: 'Multi-bundle FOTA flow',
			// We need standard state machine type because express state machines only run for 5 minutes
			stateMachineType: StateMachineType.STANDARD,
			definitionBody: DefinitionBody.fromChainable(
				// we start with valid input from the REST request: deviceId + upgradePath + account
				// get the reported version of the device
				GetDeviceFirmwareDetails.task.next(
					new Pass(this, 'setInitialUsedVersions', {
						comment: 'Set initial used versions map.',
						parameters: {},
						resultPath: '$.usedVersions',
					}).next(bundleLoop),
				),
			),
			timeout: Duration.days(30),
		})
		deviceFOTA.nrfCloudJobStatusTable.grantReadWriteData(this.stateMachine)

		const startMultiBundleFOTAFlow = new PackedLambdaFn(
			this,
			'startMultiBundleFOTAFlow',
			lambdas.start,
			{
				description: 'REST entry point that starts the multi-bundle FOTA flow',
				environment: {
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
					STATE_MACHINE_ARN: this.stateMachine.stateMachineArn,
					JOB_TABLE_NAME: deviceFOTA.jobTable.tableName,
					JOB_TABLE_DEVICE_ID_INDEX_NAME: deviceFOTA.jobTableDeviceIdIndex,
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
		this.startMultiBundleFOTAFlow = startMultiBundleFOTAFlow
		this.stateMachine.grantStartExecution(startMultiBundleFOTAFlow.fn)
		deviceStorage.devicesTable.grantReadData(startMultiBundleFOTAFlow.fn)
		deviceFOTA.jobTable.grantWriteData(startMultiBundleFOTAFlow.fn)

		this.WaitForFOTAJobCompletion = new PackedLambdaFn(
			this,
			'WaitForFOTAJobCompletion',
			lambdas.waitForFOTAJobCompletion,
			{
				description: 'Wait for the nRF Cloud FOTA job to complete',
				layers,
				timeout: Duration.minutes(1),
			},
		)
		this.stateMachine.grantTaskResponse(this.WaitForFOTAJobCompletion.fn)

		this.WaitForFOTAJobCompletion.fn.addEventSource(
			new EventSources.DynamoEventSource(deviceFOTA.nrfCloudJobStatusTable, {
				startingPosition: Lambda.StartingPosition.LATEST,
				filters: [
					Lambda.FilterCriteria.filter({
						dynamodb: {
							NewImage: {
								status: {
									S: [
										nRFCloudFOTAJobStatus.FAILED,
										nRFCloudFOTAJobStatus.CANCELLED,
										nRFCloudFOTAJobStatus.COMPLETED,
										nRFCloudFOTAJobStatus.SUCCEEDED,
										nRFCloudFOTAJobStatus.TIMED_OUT,
										nRFCloudFOTAJobStatus.REJECTED,
									],
								},
							},
						},
					}),
				],
			}),
		)
	}
}

class LambdaStep extends Construct {
	public readonly task: LambdaInvoke
	public readonly fn: PackedLambdaFn

	public constructor(
		parent: Construct,
		id: string,
		{
			source,
			layers,
			description,
			resultPath,
			initialPolicy,
			waitForJobCompletion = false,
			inputPath,
			environment,
			retry,
		}: {
			source: PackedLambda
			layers: Lambda.ILayerVersion[]
			description: string
			resultPath: string
			initialPolicy?: IAM.PolicyStatement[]
			waitForJobCompletion?: boolean
			inputPath?: string
			environment?: Record<string, string>
			retry?: boolean
		},
	) {
		super(parent, id)

		this.fn = new PackedLambdaFn(this, `Fn`, source, {
			description,
			layers,
			initialPolicy,
			environment,
		})

		this.task = new StepFunctionsTasks.LambdaInvoke(this, `${id}`, {
			lambdaFunction: this.fn.fn,
			resultPath,
			inputPath,
			retryOnServiceExceptions: retry === true,
			...(waitForJobCompletion
				? {
						integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
						payload: TaskInput.fromObject({
							'state.$': '$',
							taskToken: JsonPath.taskToken,
						}),
						heartbeatTimeout: Timeout.duration(Duration.minutes(5)),
					}
				: {
						payloadResponseOnly: true,
					}),
		})
	}
}
