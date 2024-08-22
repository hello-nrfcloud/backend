import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
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
import { createFOTAJob } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import {
	LwM2MObjectID,
	type DeviceInformation_14204,
	type NRFCloudServiceInfo_14401,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	Context,
	deviceId,
	FOTAJob,
	FOTAJobStatus,
	HttpStatusCode,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { Type, type Static } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { isObject } from 'lodash-es'
import { ulid } from '../../util/ulid.js'
import { withDevice, type WithDevice } from '../middleware/withDevice.js'
import { create, type PersistedJob } from './jobRepo.js'

const { version, DevicesTableName, jobTableName } = fromEnv({
	version: 'VERSION',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	jobTableName: 'JOB_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})

const InputSchema = Type.Intersect([
	Type.Object({
		deviceId,
		fingerprint: Type.RegExp(fingerprintRegExp),
		target: Type.Intersect([Type.Literal('app'), Type.Literal('modem')]),
	}),
	Type.Record(
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
])

const c = create(db, jobTableName)

const h = async (
	event: APIGatewayProxyEventV2,
	context: ValidInput<typeof InputSchema> & WithDevice,
): Promise<APIGatewayProxyResultV2> => {

	const { fingerprint, deviceId, target, ...upgradePath } = context.validInput
	void fingerprint
	void deviceId



	

	const account = context.device.account
	const { apiKey, apiEndpoint } = (await allNRFCloudAPIConfigs)[account] ?? {}
	if (apiKey === undefined || apiEndpoint === undefined)
		throw new Error(`nRF Cloud API key for ${stackName} is not configured.`)

	const createJob = createFOTAJob(
		{
			endpoint: apiEndpoint,
			apiKey,
		},
		trackFetch,
	)

	const res = await createJob({
		deviceId: context.device.id,
		bundleId,
	})

	const jobId = ulid()
	const persistedJob: PersistedJob = {
		id: jobId,
		deviceId: context.device.id,
		timestamp: new Date().toISOString(),
		status: FOTAJobStatus.NEW,
		target,
		upgradePath,
		statusDetail: 'The job has been created',
	}

	const job: Static<typeof FOTAJob> = {
		'@context': Context.fotaJob.toString(),
		...persistedJob,
	}
	await c(persistedJob)

	return aResponse(HttpStatusCode.CREATED, {
		...job,
		'@context': Context.fotaJob,
	})
}
export const handler = middy()
	.use(corsOPTIONS('POST'))
	.use(addVersionHeader(version))
	.use(requestLogger())
	.use(validateInput(InputSchema))
	.use(withDevice({ db, DevicesTableName }))
	.use(problemResponse())
	.handler(h)

const isNRFCloudServiceInfo = (
	instance: unknown,
): instance is NRFCloudServiceInfo_14401 =>
	isObject(instance) &&
	'ObjectID' in instance &&
	instance.ObjectID === LwM2MObjectID.NRFCloudServiceInfo_14401

const isDeviceInfo = (instance: unknown): instance is DeviceInformation_14204 =>
	isObject(instance) &&
	'ObjectID' in instance &&
	instance.ObjectID === LwM2MObjectID.DeviceInformation_14204
