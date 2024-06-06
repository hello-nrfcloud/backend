import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { marshall } from '@aws-sdk/util-dynamodb'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { tryAsJSON } from '@hello.nrfcloud.com/lambda-helpers/tryAsJSON'
import { createFOTAJob } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import {
	formatTypeBoxErrors,
	validateWithTypeBox,
} from '@hello.nrfcloud.com/proto'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	HttpStatusCode,
	InternalError,
	deviceId,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { Type } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { getDeviceById } from '../../devices/getDeviceById.js'
import { getAllNRFCloudAPIConfigs } from '../getAllNRFCloudAPIConfigs.js'
import { loggingFetch } from '../loggingFetch.js'

const { stackName, version, DevicesTableName, jobStatusTableName } = fromEnv({
	stackName: 'STACK_NAME',
	version: 'VERSION',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	jobStatusTableName: 'JOB_STATUS_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})
const ssm = new SSMClient({})

const allNRFCloudAPIConfigs = getAllNRFCloudAPIConfigs({ ssm, stackName })()

const getDevice = getDeviceById({
	db,
	DevicesTableName,
})

const { track } = metricsForComponent('deviceFOTA')
const trackFetch = loggingFetch({ track, log: logger('deviceFOTA') })

const validateInput = validateWithTypeBox(
	Type.Object({
		id: deviceId,
		bundleId: Type.RegExp(
			/^(APP|MODEM|BOOT|SOFTDEVICE|BOOTLOADER|MDM_FULL)\*[0-9a-zA-Z]{8}\*.*$/,
			{
				title: 'Bundle ID',
				description: 'The nRF Cloud firmware bundle ID',
			},
		),
		fingerprint: Type.Optional(Type.RegExp(fingerprintRegExp)),
	}),
)

const h = async (
	event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
	console.info('event', { event })

	const maybeValidInput = validateInput({
		...(event.queryStringParameters ?? {}),
		...(event.pathParameters ?? {}),
		...tryAsJSON(event.body),
	})
	if ('errors' in maybeValidInput) {
		return aProblem({
			title: 'Validation failed',
			status: HttpStatusCode.BAD_REQUEST,
			detail: formatTypeBoxErrors(maybeValidInput.errors),
		})
	}

	const deviceId = maybeValidInput.value.id

	const maybeDevice = await getDevice(deviceId)
	if ('error' in maybeDevice) {
		return aProblem({
			title: `No device found with ID!`,
			detail: deviceId,
			status: HttpStatusCode.NOT_FOUND,
		})
	}

	const device = maybeDevice.device
	if (device.fingerprint !== maybeValidInput.value.fingerprint) {
		return aProblem({
			title: `Fingerprint does not match!`,
			detail: maybeValidInput.value.fingerprint,
			status: HttpStatusCode.FORBIDDEN,
		})
	}

	const account = device.account
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
		deviceId,
		bundleId: maybeValidInput.value.bundleId,
	})

	if ('result' in res) {
		console.debug(`Accepted`)
		track('success', MetricUnit.Count, 1)

		const now = new Date().toISOString()
		await db.send(
			new PutItemCommand({
				TableName: jobStatusTableName,
				Item: marshall({
					deviceId,
					jobId: res.result.jobId,
					status: 'QUEUED',
					createdAt: now,
					lastUpdatedAt: now,
					nextUpdateAt: now,
					account,
					ttl: Math.round(Date.now() / 1000) + 60 * 60 * 24 * 30,
				}),
			}),
		)

		return aResponse(HttpStatusCode.ACCEPTED)
	} else {
		console.error(`Scheduling FOTA update failed`, JSON.stringify(res))
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
	.use(addVersionHeader(version))
	.use(corsOPTIONS('PATCH'))
	.handler(h)
