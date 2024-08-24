import {
	ConditionalCheckFailedException,
	DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { fromEnv } from '@bifravst/from-env'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
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
import type { FOTAJob } from '@hello.nrfcloud.com/proto/hello'
import {
	Context,
	deviceId,
	FOTAJobStatus,
	HttpStatusCode,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { Type, type Static } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { ulid } from '../../util/ulid.js'
import { withDevice, type WithDevice } from '../middleware/withDevice.js'
import { getDeviceFirmwareDetails } from './getDeviceFirmwareDetails.js'
import { getNextUpgrade } from './getNextUpgrade.js'
import { create, pkFromTarget, type PersistedJob } from './jobRepo.js'

const { version, DevicesTableName, jobTableName } = fromEnv({
	version: 'VERSION',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	jobTableName: 'JOB_TABLE_NAME',
	stackName: 'STACK_NAME',
})(process.env)

const db = new DynamoDBClient({})
const iotData = new IoTDataPlaneClient({})

const InputSchema = Type.Object({
	deviceId,
	fingerprint: Type.RegExp(fingerprintRegExp),
	upgradePath: Type.Record(
		Type.RegExp(/[0-9]+\.[0-9]+\.[0-9]+/, {
			title: 'Version',
			description: 'The version the bundle is targeting',
		}),
		Type.RegExp(
			/^(APP|MODEM|BOOT|SOFTDEVICE|BOOTLOADER|MDM_FULL)\*[0-9a-zA-Z]{8}\*.*$/,
			{
				title: 'Bundle ID',
				description: 'The nRF Cloud firmware bundle ID',
			},
		),
	),
})

const c = create(db, jobTableName)
const checkDevice = getDeviceFirmwareDetails(iotData)

const h = async (
	event: APIGatewayProxyEventV2,
	context: ValidInput<typeof InputSchema> & WithDevice,
): Promise<APIGatewayProxyResultV2> => {
	const { fingerprint, deviceId, upgradePath } = context.validInput
	void fingerprint

	const maybeFirmwareDetails = await checkDevice(deviceId)
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
	const persistedJob: PersistedJob = {
		id: jobId,
		pk: pkFromTarget({ deviceId, target }),
		deviceId: context.device.id,
		timestamp: new Date().toISOString(),
		status: FOTAJobStatus.NEW,
		upgradePath,
		statusDetail: 'The job has been created',
		account: context.device.account,
		reportedVersion,
		target,
	}

	const job: Static<typeof FOTAJob> = {
		'@context': Context.fotaJob.toString(),
		...persistedJob,
	}
	try {
		await c(persistedJob)

		return aResponse(HttpStatusCode.CREATED, {
			...job,
			'@context': Context.fotaJob,
		})
	} catch (error) {
		if (error instanceof ConditionalCheckFailedException) {
			throw new ProblemDetailError({
				title: 'A FOTA job for this device already exists',
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
