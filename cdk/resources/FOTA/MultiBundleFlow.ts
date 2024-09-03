import type { PackedLambda } from '@bifravst/aws-cdk-lambda-helpers'
import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import {
	Duration,
	type aws_dynamodb as DynamoDB,
	aws_iam as IAM,
	type aws_lambda as Lambda,
	Stack,
	aws_stepfunctions as StepFunctions,
	aws_stepfunctions_tasks as StepFunctionsTasks,
} from 'aws-cdk-lib'
import { Pass, Succeed } from 'aws-cdk-lib/aws-stepfunctions'
import {
	DynamoAttributeValue,
	type LambdaInvoke,
} from 'aws-cdk-lib/aws-stepfunctions-tasks'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../../packBackendLambdas.js'

/**
 * This implements a state machine to drive a the multi-bundle flow where
 * multiple delta updates are be applied instead of one full update in order to
 * save the amount of data that needs to be transferred.
 */
export class MultiBundleFOTAFlow extends Construct {
	public readonly stateMachine: StepFunctions.IStateMachine
	public constructor(
		parent: Construct,
		{
			lambdas,
			layers,
			nrfCloudJobStatusTable,
		}: {
			lambdas: BackendLambdas['multiBundleFOTAFlow']
			layers: Lambda.ILayerVersion[]
			nrfCloudJobStatusTable: DynamoDB.ITable
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

		const GetNextBundle = new LambdaStep(this, 'GetNextBundle', {
			source: lambdas.getNextBundle,
			layers,
			description: 'Get the next bundle to apply',
			resultPath: '$.nextBundle',
		})

		const bundleLoop = GetNextBundle.task // Figure out the next bundle
		bundleLoop.next(
			new StepFunctions.Choice(this, 'Found next bundle?')
				.when(
					StepFunctions.Condition.isNotNull(`$.nextBundle.bundleId`),
					new Pass(this, 'updateUsedVersion', {
						comment: 'Update the usedVersions map.',
						parameters: {
							'deviceId.$': '$.deviceId',
							'upgradePath.$': '$.upgradePath',
							'deviceFirmwareDetails.$': '$.deviceFirmwareDetails',
							'nextBundle.$': '$.nextBundle',
							'account.$': '$.account',
							'usedVersions.$': `States.JsonMerge($.usedVersions, States.StringToJson(States.Format('\\{"{}":"{}"\\}', $.reportedVersion, $.nextBundle.bundleId)), false)`,
						},
					}).next(
						// Create the FOTA job on nRF Cloud for the bundle
						new LambdaStep(this, 'createFOTAJob', {
							source: lambdas.createFOTAJob,
							layers,
							description: 'Create the FOTA job on nRF Cloud',
							resultPath: '$.fotaJob',
						}).task.next(
							// Persist the job details so the job fetcher can poll the API
							new StepFunctionsTasks.DynamoPutItem(this, 'PersistJobDetails', {
								table: nrfCloudJobStatusTable,
								item: {
									jobId: DynamoAttributeValue.fromString(
										StepFunctions.JsonPath.stringAt('$.fotaJob.id'),
									),
									account: DynamoAttributeValue.fromString(
										StepFunctions.JsonPath.stringAt('$.account'),
									),
									lastUpdatedAt: DynamoAttributeValue.fromString(
										StepFunctions.JsonPath.stateEnteredTime,
									),
									createdAt: DynamoAttributeValue.fromString(
										StepFunctions.JsonPath.stateEnteredTime,
									),
								},
							}).next(
								new LambdaStep(this, 'waitForFOTAJobCompletion', {
									source: lambdas.waitForFOTAJobCompletion,
									layers,
									description: 'Wait for the FOTA job to complete',
									resultPath: '$.fotaJobStatus',
									waitForJobCompletion: true,
								}).task.next(
									new LambdaStep(this, 'waitForUpdateApplied', {
										source: lambdas.waitForUpdateApplied,
										layers,
										description:
											'Wait for the device to report the updated version',
										resultPath: '$.updatedDeviceFirmwareDetails',
										waitForJobCompletion: true,
									}).task.next(
										new Pass(this, 'updateReportedVersion', {
											parameters: {
												'appVersion.$':
													'$.updatedDeviceFirmwareDetails.appVersion',
												'mfwVersion.$':
													'$.updatedDeviceFirmwareDetails.mfwVersion',
												'supportedFOTATypes.$':
													'$.updatedDeviceFirmwareDetails.supportedFOTATypes',
											},
											comment: 'Update the version reported by the device.',
											resultPath: '$.	deviceFirmwareDetails',
										}).next(bundleLoop),
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

		this.stateMachine = new StepFunctions.StateMachine(this, 'StateMachine', {
			stateMachineName: `${Stack.of(this).stackName}-multi-bundle-fota-flow`,
			// We need standard state machine type because express state machines only run for 5 minutes
			stateMachineType: StepFunctions.StateMachineType.STANDARD,
			definitionBody: StepFunctions.DefinitionBody.fromChainable(
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
		nrfCloudJobStatusTable.grantReadWriteData(this.stateMachine)
	}
}

class LambdaStep extends Construct {
	public readonly task: LambdaInvoke

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
		}: {
			source: PackedLambda
			layers: Lambda.ILayerVersion[]
			description: string
			resultPath: string
			initialPolicy?: IAM.PolicyStatement[]
			waitForJobCompletion?: boolean
			inputPath?: string
		},
	) {
		super(parent, id)

		const fn = new PackedLambdaFn(this, `Fn`, source, {
			description,
			layers,
			initialPolicy,
		})

		this.task = new StepFunctionsTasks.LambdaInvoke(this, `${id}`, {
			lambdaFunction: fn.fn,
			resultPath,
			inputPath,
			...(waitForJobCompletion
				? {
						integrationPattern:
							StepFunctions.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
						payload: StepFunctions.TaskInput.fromObject({
							'state.$': '$',
							taskToken: StepFunctions.JsonPath.taskToken,
						}),
					}
				: {
						payloadResponseOnly: true,
					}),
		})
	}
}
