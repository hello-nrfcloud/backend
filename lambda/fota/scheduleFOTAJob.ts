import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { SSMClient } from '@aws-sdk/client-ssm'
import { marshall } from '@aws-sdk/util-dynamodb'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { createFOTAJob } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import {
	LwM2MObjectID,
	type NRFCloudServiceInfo_14401,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	Context,
	HttpStatusCode,
	InternalError,
	deviceId,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import { fromEnv } from '@bifravst/from-env'
import { Type } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { isObject } from 'lodash-es'
import { getAllNRFCloudAPIConfigs } from '../nrfcloud/getAllNRFCloudAPIConfigs.js'
import { getLwM2MShadow } from '../../lwm2m/getLwM2MShadow.js'
import { loggingFetch } from '../../util/loggingFetch.js'
import {
	validateInput,
	type ValidInput,
} from '@hello.nrfcloud.com/lambda-helpers/validateInput'
import { withDevice, type WithDevice } from '../middleware/withDevice.js'
import type { Job } from './Job.js'
import { toJobExecution } from './toJobExecution.js'

const { stackName, version, DevicesTableName, jobStatusTableName } = fromEnv({
	stackName: 'STACK_NAME',
	version: 'VERSION',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	jobStatusTableName: 'JOB_STATUS_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})
const ssm = new SSMClient({})
const iotData = new IoTDataPlaneClient({})

const allNRFCloudAPIConfigs = getAllNRFCloudAPIConfigs({ ssm, stackName })()

const getShadow = getLwM2MShadow(iotData)

const { track } = metricsForComponent('deviceFOTA')
const trackFetch = loggingFetch({ track, log: logger('deviceFOTA') })

const InputSchema = Type.Object({
	deviceId,
	bundleId: Type.RegExp(
		/^(APP|MODEM|BOOT|SOFTDEVICE|BOOTLOADER|MDM_FULL)\*[0-9a-zA-Z]{8}\*.*$/,
		{
			title: 'Bundle ID',
			description: 'The nRF Cloud firmware bundle ID',
		},
	),
	fingerprint: Type.RegExp(fingerprintRegExp),
})

const h = async (
	event: APIGatewayProxyEventV2,
	context: ValidInput<typeof InputSchema> & WithDevice,
): Promise<APIGatewayProxyResultV2> => {
	const maybeShadow = await getShadow(context.device)
	if ('error' in maybeShadow) {
		console.error(maybeShadow.error)
		return aProblem({
			title: `Unknown device state!`,
			detail: maybeShadow.error.message,
			status: HttpStatusCode.INTERNAL_SERVER_ERROR,
		})
	}
	const supportedFOTATypes =
		maybeShadow.shadow.reported.find(isNRFCloudServiceInfo)?.Resources[0] ?? []

	if (supportedFOTATypes.length === 0) {
		return aProblem({
			title: `This device does not support FOTA!`,
			status: HttpStatusCode.BAD_REQUEST,
		})
	}

	if (
		supportedFOTATypes.find((type) =>
			context.validInput.bundleId.startsWith(type),
		) === undefined
	) {
		return aProblem({
			title: `This device does not support the bundle type!`,
			detail: `Supported FOTA types are: ${supportedFOTATypes.join(', ')}`,
			status: HttpStatusCode.BAD_REQUEST,
		})
	}

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
		bundleId: context.validInput.bundleId,
	})

	if ('result' in res) {
		console.debug(`Accepted`)
		track('success', MetricUnit.Count, 1)

		const now = new Date().toISOString()
		const job: Job = {
			deviceId: context.device.id,
			jobId: res.result.jobId,
			status: 'QUEUED',
			createdAt: now,
			lastUpdatedAt: now,
			nextUpdateAt: now,
			account,
			firmware: null,
			statusDetail: null,
			target: null,
		}
		await db.send(
			new PutItemCommand({
				TableName: jobStatusTableName,
				Item: marshall({
					...job,
					ttl: Math.round(Date.now() / 1000) + 60 * 60 * 24 * 30,
				}),
			}),
		)

		return aResponse(HttpStatusCode.CREATED, {
			...toJobExecution(job),
			'@context': Context.fotaJobExecution,
		})
	} else {
		console.error(`Scheduling FOTA update failed`, res.error)
		track('error', MetricUnit.Count, 1)
		return aProblem(
			InternalError({
				title: `Scheduling FOTA update failed`,
				detail: res.error.message,
			}),
		)
	}
}
export const handler = middy()
	.use(corsOPTIONS('PATCH'))
	.use(addVersionHeader(version))
	.use(requestLogger())
	.use(validateInput(InputSchema))
	.use(withDevice({ db, DevicesTableName }))
	.handler(h)

const isNRFCloudServiceInfo = (
	instance: unknown,
): instance is NRFCloudServiceInfo_14401 =>
	isObject(instance) &&
	'ObjectID' in instance &&
	instance.ObjectID === LwM2MObjectID.NRFCloudServiceInfo_14401
