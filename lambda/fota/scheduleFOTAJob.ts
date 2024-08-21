import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { SSMClient } from '@aws-sdk/client-ssm'
import { marshall } from '@aws-sdk/util-dynamodb'
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
	HttpStatusCode,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { Type, type Static } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { isObject } from 'lodash-es'
import { getLwM2MShadow } from '../../lwm2m/getLwM2MShadow.js'
import { ulid } from '../../util/ulid.js'
import { withDevice, type WithDevice } from '../middleware/withDevice.js'

const { version, DevicesTableName, jobStatusTableName } = fromEnv({
	version: 'VERSION',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	jobStatusTableName: 'JOB_STATUS_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})
const ssm = new SSMClient({})
const iotData = new IoTDataPlaneClient({})

const getShadow = getLwM2MShadow(iotData)

const { track } = metricsForComponent('deviceFOTA')

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

const h = async (
	event: APIGatewayProxyEventV2,
	context: ValidInput<typeof InputSchema> & WithDevice,
): Promise<APIGatewayProxyResultV2> => {
	const maybeShadow = await getShadow(context.device)
	if ('error' in maybeShadow) {
		console.error(maybeShadow.error)
		throw new Error(`Unknown device state: ${maybeShadow.error.message}!`)
	}
	const supportedFOTATypes =
		maybeShadow.shadow.reported.find(isNRFCloudServiceInfo)?.Resources[0] ?? []
	const appVersion =
		maybeShadow.shadow.reported.find(isDeviceInfo)?.Resources[3]
	const mfwVersion =
		maybeShadow.shadow.reported.find(isDeviceInfo)?.Resources[2]

	if (supportedFOTATypes.length === 0) {
		throw new ProblemDetailError({
			title: `This device does not support FOTA!`,
			status: HttpStatusCode.BAD_REQUEST,
		})
	}

	const { fingerprint, deviceId, target, ...upgradePath } = context.validInput
	void fingerprint
	void deviceId

	if (target === 'app' && appVersion === undefined) {
		throw new ProblemDetailError({
			title: `This device has not yet reported an application firmware version!`,
			status: HttpStatusCode.BAD_REQUEST,
		})
	}

	if (target === 'modem' && mfwVersion === undefined) {
		throw new ProblemDetailError({
			title: `This device has not yet reported a modem firmware version!`,
			status: HttpStatusCode.BAD_REQUEST,
		})
	}

	const reportedVersion = (target === 'app' ? appVersion : mfwVersion) as string
	console.debug(JSON.stringify({ reportedVersion }))

	const jobId = ulid()
	await db.send(
		new PutItemCommand({
			TableName: jobStatusTableName,
			Item: marshall({
				jobId,
				target,
				reportedVersion,
				upgradePath,
				ttl: Math.round(Date.now() / 1000) + 60 * 60 * 24 * 30,
			}),
		}),
	)

	const job: Static<typeof FOTAJob> = {
		'@context': Context.fotaJob.toString(),
		id: jobId,
		deviceId: context.device.id,
		timestamp: new Date().toISOString(),
		status: 'NEW',
	}

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
