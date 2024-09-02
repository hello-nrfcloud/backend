import { MetricUnit } from '@aws-lambda-powertools/metrics'
import {
	ConditionalCheckFailedException,
	DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'
import { fromEnv } from '@bifravst/from-env'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import {
	ProblemDetailError,
	problemResponse,
} from '@hello.nrfcloud.com/lambda-helpers/problemResponse'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import {
	validateInput,
	type ValidInput,
} from '@hello.nrfcloud.com/lambda-helpers/validateInput'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	Context,
	deviceId,
	FOTAJob,
	FOTAJobStatus,
	HttpStatusCode,
	UpgradePath,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { Type, type Static } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { ulid } from '../../../util/ulid.js'
import { withDevice, type WithDevice } from '../../middleware/withDevice.js'
import { getDeviceFirmwareDetails } from '../getDeviceFirmwareDetails.js'
import { getNextUpgrade } from '../getNextUpgrade.js'
import { create } from '../jobRepo.js'

const { version, DevicesTableName, JobTableName, StateMachineArn } = fromEnv({
	version: 'VERSION',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	JobTableName: 'JOB_TABLE_NAME',
	stackName: 'STACK_NAME',
	StateMachineArn: 'STATE_MACHINE_ARN',
})(process.env)

const db = new DynamoDBClient({})
const iotData = new IoTDataPlaneClient({})
const sf = new SFNClient({})

const InputSchema = Type.Object({
	deviceId,
	fingerprint: Type.RegExp(fingerprintRegExp),
	upgradePath: UpgradePath,
})

const c = create(db, JobTableName)
const checkDevice = getDeviceFirmwareDetails(iotData)

const { track } = metricsForComponent('deviceFOTA')

const h = async (
	event: APIGatewayProxyEventV2,
	context: ValidInput<typeof InputSchema> & WithDevice,
): Promise<APIGatewayProxyResultV2> => {
	const { fingerprint, deviceId, upgradePath } = context.validInput
	void fingerprint

	const maybeFirmwareDetails = await checkDevice(deviceId, (...args) =>
		console.debug(`[FOTA:${deviceId}]`, ...args.map((a) => JSON.stringify(a))),
	)
	if ('error' in maybeFirmwareDetails) {
		throw new ProblemDetailError({
			title: 'Device is not eligible for FOTA',
			status: HttpStatusCode.BAD_REQUEST,
			detail: maybeFirmwareDetails.error.message,
		})
	}

	const maybeUpgrade = getNextUpgrade(upgradePath, maybeFirmwareDetails.details)
	if ('error' in maybeUpgrade) {
		throw new ProblemDetailError({
			title: 'Invalid upgrade path defined',
			status: HttpStatusCode.BAD_REQUEST,
			detail: maybeUpgrade.error.message,
		})
	}

	const { reportedVersion, target } = maybeUpgrade.upgrade

	const jobId = ulid()

	const job: Static<typeof FOTAJob> = {
		'@context': Context.fotaJob.toString(),
		id: jobId,
		deviceId: context.device.id,
		timestamp: new Date().toISOString(),
		status: FOTAJobStatus.NEW,
		upgradePath,
		statusDetail: 'The job has been created',
		reportedVersion,
	}

	try {
		const { '@context': ctx, ...jobDetails } = job
		void ctx
		await c({
			account: context.device.account,
			target,
			...jobDetails,
		})

		await sf.send(
			new StartExecutionCommand({
				stateMachineArn: StateMachineArn,
				name: jobId,
				input: JSON.stringify({
					deviceId: context.device.id,
					upgradePath,
					reportedVersion,
					account: context.device.account,
				}),
			}),
		)

		track('created', MetricUnit.Count, 1)

		return aResponse(HttpStatusCode.CREATED, {
			...job,
			'@context': Context.fotaJob,
		})
	} catch (error) {
		if (error instanceof ConditionalCheckFailedException) {
			throw new ProblemDetailError({
				title: `A ${target} FOTA job for this device already exists`,
				status: HttpStatusCode.CONFLICT,
			})
		}
		throw error
	}
}
export const handler = middy()
	.use(corsOPTIONS('POST'))
	.use(addVersionHeader(version))
	.use(requestLogger())
	.use(validateInput(InputSchema))
	.use(withDevice({ db, DevicesTableName }))
	.use(problemResponse())
	.handler(h)
