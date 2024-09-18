import type { PackedLambda } from '@bifravst/aws-cdk-lambda-helpers'
import {
	IoTActionRole,
	PackedLambdaFn,
} from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { FOTAJobStatus as nRFCloudFOTAJobStatus } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { definitions, LwM2MObjectID } from '@hello.nrfcloud.com/proto-map/lwm2m'
import { FOTAJobStatus } from '@hello.nrfcloud.com/proto/hello'
import {
	Duration,
	aws_lambda_event_sources as EventSources,
	aws_iam as IAM,
	aws_iot as IoT,
	aws_lambda as Lambda,
	aws_logs as Logs,
	RemovalPolicy,
	aws_stepfunctions_tasks as StepFunctionsTasks,
} from 'aws-cdk-lib'
import {
	Choice,
	Condition,
	DefinitionBody,
	IntegrationPattern,
	JsonPath,
	Parallel,
	Pass,
	StateMachine,
	StateMachineType,
	Succeed,
	TaskInput,
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
	public readonly WaitForUpdateApplied: PackedLambdaFn
	public readonly startMultiBundleFOTAFlow: PackedLambdaFn
	public readonly logGroup: Logs.ILogGroup

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

		this.logGroup = new Logs.LogGroup(this, 'logGroup', {
			removalPolicy:
				this.node.getContext('isTest') === true
					? RemovalPolicy.DESTROY
					: RemovalPolicy.RETAIN,
			logGroupName: `/${this.node.path}/`, // e.g. /<stack name>/MultiBundleFOTAFlow/
			retention: Logs.RetentionDays.ONE_MONTH,
			logGroupClass: Logs.LogGroupClass.STANDARD, // INFREQUENT_ACCESS does not support custom metrics
		})

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
				logGroup: this.logGroup,
			},
		)
		this.GetDeviceFirmwareDetails = GetDeviceFirmwareDetails.fn

		const GetNextBundle = new LambdaStep(this, 'GetNextBundle', {
			source: lambdas.getNextBundle,
			layers,
			description: 'Get the next bundle to apply',
			resultPath: '$.nextBundle',
			logGroup: this.logGroup,
		})
		this.GetNextBundle = GetNextBundle.fn

		const CreateFOTAJob = new LambdaStep(this, 'createFOTAJob', {
			source: lambdas.createFOTAJob,
			layers,
			description: 'Create the FOTA job on nRF Cloud',
			resultPath: '$.fotaJob',
			retry: true,
			logGroup: this.logGroup,
		})
		this.CreateFOTAJob = CreateFOTAJob.fn

		const WaitForFOTAJobCompletionCallback = new LambdaStep(
			this,
			'WaitForFOTAJobCompletion',
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
				logGroup: this.logGroup,
			},
		)
		this.WaitForFOTAJobCompletionCallback = WaitForFOTAJobCompletionCallback.fn
		deviceFOTA.nrfCloudJobStatusTable.grantWriteData(
			this.WaitForFOTAJobCompletionCallback.fn,
		)

		const WaitForUpdateAppliedCallback = new LambdaStep(
			this,
			'WaitForUpdateApplied',
			{
				source: lambdas.waitForUpdateAppliedCallback,
				layers,
				description:
					'Records the callback token for the task waiting for the device to report the update version',
				resultPath: '$.updatedDeviceFirmwareDetails',
				waitForJobCompletion: true,
				environment: {
					JOB_TABLE_NAME: deviceFOTA.jobTable.tableName,
				},
				logGroup: this.logGroup,
			},
		)
		this.WaitForUpdateAppliedCallback = WaitForUpdateAppliedCallback.fn
		deviceFOTA.jobTable.grantWriteData(this.WaitForUpdateAppliedCallback.fn)

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
					})
						.next(
							// Create the FOTA job on nRF Cloud for the bundle
							CreateFOTAJob.task,
						)
						.next(
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
							}),
						)
						.next(
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
							}),
						)
						.next(
							new Parallel(this, 'WaitForUpdateSuccess', {}).branch(
								WaitForUpdateAppliedCallback.task,
								WaitForFOTAJobCompletionCallback.task,
							),
						)
						.next(
							new Pass(this, 'mergeResults', {
								comment: 'Merge results from parallel branches.',
								parameters: {
									usedVersions: JsonPath.objectAt('$[0].usedVersions'),
									reportedVersion: JsonPath.stringAt('$[0].reportedVersion'),
									nextBundle: JsonPath.objectAt('$[0].nextBundle'),
									job: JsonPath.objectAt('$[0].job'),
									deviceFirmwareDetails: JsonPath.objectAt(
										'$[0].deviceFirmwareDetails',
									),
									upgradePath: JsonPath.objectAt('$[0].upgradePath'),
									deviceId: JsonPath.stringAt('$[0].deviceId'),
									account: JsonPath.stringAt('$[0].account'),
									fotaJob: JsonPath.objectAt('$[0].fotaJob'),
									updatedDeviceFirmwareDetails: JsonPath.objectAt(
										'$[0].updatedDeviceFirmwareDetails',
									),
									fotaJobStatus: JsonPath.objectAt('$[1].fotaJobStatus'),
								},
							}),
						)
						.next(
							new Choice(this, 'Application or MFM updated?')
								.when(
									Condition.isNotNull(
										`$.updatedDeviceFirmwareDetails.appVersion`,
									),
									new Pass(this, 'updateReportedAppVersion', {
										parameters: {
											appVersion: JsonPath.stringAt(
												'$.updatedDeviceFirmwareDetails.appVersion',
											),
											mfwVersion: JsonPath.stringAt(
												'$.deviceFirmwareDetails.mfwVersion',
											),
											supportedFOTATypes: JsonPath.listAt(
												'$.deviceFirmwareDetails.supportedFOTATypes',
											),
										},
										comment:
											'Update the application version reported by the device.',
										resultPath: '$.deviceFirmwareDetails',
									})
										.next(
											new Pass(this, 'updateReportedVersionFromAppVersion', {
												inputPath: '$.updatedDeviceFirmwareDetails.appVersion',
												resultPath: '$.reportedVersion',
											}),
										)
										.next(bundleLoop),
								)
								.otherwise(
									new Pass(this, 'updateReportedMFWVersion', {
										parameters: {
											mfwVersion: JsonPath.stringAt(
												'$.updatedDeviceFirmwareDetails.mfwVersion',
											),
											appVersion: JsonPath.stringAt(
												'$.deviceFirmwareDetails.appVersion',
											),
											supportedFOTATypes: JsonPath.listAt(
												'$.deviceFirmwareDetails.supportedFOTATypes',
											),
										},
										comment:
											'Update the modem firmware version reported by the device.',
										resultPath: '$.deviceFirmwareDetails',
									})
										.next(
											new Pass(this, 'updateReportedVersionFromMfwVersion', {
												inputPath: '$.updatedDeviceFirmwareDetails.mfwVersion',
												resultPath: '$.reportedVersion',
											}),
										)
										.next(bundleLoop),
								),
						),
				)
				.otherwise(
					new StepFunctionsTasks.DynamoGetItem(this, 'GetJob', {
						comment: 'Get the current job',
						table: deviceFOTA.jobTable,
						key: {
							pk: DynamoAttributeValue.fromString(
								JsonPath.stringAt('$.job.pk'),
							),
						},
						resultPath: '$.DynamoDB',
					})
						.next(
							new Pass(this, 'extractItem', {
								comment: 'Set the PK to be the ID.',
								inputPath: '$.DynamoDB.Item',
								resultPath: '$.jobItem',
							}),
						)
						.next(
							new StepFunctionsTasks.DynamoDeleteItem(this, 'DeleteJob', {
								comment: 'Delete the job (it will be saved as a copy)',
								table: deviceFOTA.jobTable,
								key: {
									pk: DynamoAttributeValue.fromString(
										JsonPath.stringAt('$.job.pk'),
									),
								},
								resultPath: '$.DynamoDB',
							}),
						)
						.next(
							new Pass(this, 'updatePk', {
								comment: 'Set the PK to be the ID.',
								inputPath: '$.jobItem.id',
								resultPath: '$.jobItem.pk',
							}),
						)
						.next(
							new StepFunctionsTasks.DynamoPutItem(this, 'CopyJob', {
								comment: 'Copy the job to a new ID',
								table: deviceFOTA.jobTable,
								item: {
									pk: DynamoAttributeValue.fromString(
										JsonPath.stringAt('$.jobItem.id.S'),
									), // "01J71XVDKV9YY7H4CDCKQXJB3Q",
									account: DynamoAttributeValue.fromString(
										JsonPath.stringAt('$.jobItem.account.S'),
									), // "nordic",
									deviceId: DynamoAttributeValue.fromString(
										JsonPath.stringAt('$.jobItem.deviceId.S'),
									), // "oob-350006668224459",
									id: DynamoAttributeValue.fromString(
										JsonPath.stringAt('$.jobItem.id.S'),
									), // "01J71XVDKV9YY7H4CDCKQXJB3Q",
									reportedVersion: DynamoAttributeValue.fromString(
										JsonPath.stringAt('$.reportedVersion'),
									), // "2.0.0",
									status: DynamoAttributeValue.fromString(
										FOTAJobStatus.SUCCEEDED,
									),
									statusDetail: DynamoAttributeValue.fromString(
										JsonPath.format(
											'No more bundles to apply for {}. Job completed.',
											JsonPath.stringAt('$.reportedVersion'),
										),
									),
									target: DynamoAttributeValue.fromString(
										JsonPath.stringAt('$.jobItem.target.S'),
									), // "app",
									timestamp: DynamoAttributeValue.fromString(
										JsonPath.stringAt('$$.State.EnteredTime'),
									), // "2024-09-05T20:26:12.987Z",
									ttl: DynamoAttributeValue.fromNumber(
										JsonPath.numberAt('$.jobItem.ttl.N'),
									), // 1728159973,
									upgradePath: DynamoAttributeValue.mapFromJsonPath(
										'$.jobItem.upgradePath.M',
									), // { "2.0.0": "APP*1e29dfa3*v2.0.1" }
								},
								resultPath: '$.DynamoDB',
							}),
						)
						.next(
							new Succeed(this, 'noMoreBundles', {
								comment: 'No more bundles to apply.',
							}),
						),
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
				logGroup: this.logGroup,
			},
		)
		this.startMultiBundleFOTAFlow = startMultiBundleFOTAFlow
		this.stateMachine.grantStartExecution(startMultiBundleFOTAFlow.fn)
		deviceStorage.devicesTable.grantReadData(startMultiBundleFOTAFlow.fn)
		deviceFOTA.jobTable.grantWriteData(startMultiBundleFOTAFlow.fn)

		this.WaitForFOTAJobCompletion = new PackedLambdaFn(
			this,
			'WaitForFOTAJobCompletionFn',
			lambdas.waitForFOTAJobCompletion,
			{
				description: 'Wait for the nRF Cloud FOTA job to complete',
				layers,
				timeout: Duration.minutes(1),
				logGroup: this.logGroup,
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

		this.WaitForUpdateApplied = new PackedLambdaFn(
			this,
			'WaitForUpdateAppliedFn',
			lambdas.WaitForUpdateApplied,
			{
				layers,
				description:
					'Receives the reported firmware version from the device and updates the job status',
				environment: {
					JOB_TABLE_NAME: deviceFOTA.jobTable.tableName,
				},
				logGroup: this.logGroup,
			},
		)
		deviceFOTA.jobTable.grantReadData(this.WaitForUpdateApplied.fn)
		this.stateMachine.grantTaskResponse(this.WaitForUpdateApplied.fn)

		const waitForFirmwareVersionReportRuleRole = new IoTActionRole(this).role

		const waitForFirmwareVersionReportRule = new IoT.CfnTopicRule(
			this,
			'waitForFirmwareVersionReportRule',
			{
				topicRulePayload: {
					description: 'Observe the device shadow for firmware version updates',
					ruleDisabled: false,
					awsIotSqlVersion: '2016-03-23',
					sql: [
						`SELECT`,
						`state.reported as reported,`,
						`topic(3) as deviceId`,
						`FROM '$aws/things/+/shadow/name/lwm2m/update/accepted'`,
						`WHERE isUndefined(get(state.reported, "${LwM2MObjectID.DeviceInformation_14204}:${definitions[LwM2MObjectID.DeviceInformation_14204].ObjectVersion}")) = false`,
					].join(' '),
					actions: [
						{
							lambda: {
								functionArn: this.WaitForUpdateApplied.fn.functionArn,
							},
						},
					],
					errorAction: {
						republish: {
							roleArn: waitForFirmwareVersionReportRuleRole.roleArn,
							topic: 'errors',
						},
					},
				},
			},
		)

		this.WaitForUpdateApplied.fn.addPermission('topicRule', {
			principal: new IAM.ServicePrincipal('iot.amazonaws.com'),
			sourceArn: waitForFirmwareVersionReportRule.attrArn,
		})
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
			logGroup,
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
			logGroup: Logs.ILogGroup
		},
	) {
		super(parent, id)

		this.fn = new PackedLambdaFn(this, `Fn`, source, {
			description,
			layers,
			initialPolicy,
			environment,
			logGroup,
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
					}
				: {
						payloadResponseOnly: true,
					}),
		})
	}
}
