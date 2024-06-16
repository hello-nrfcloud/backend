import {
	BatchGetItemCommand,
	DynamoDBClient,
	QueryCommand,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import {
	formatTypeBoxErrors,
	validateWithTypeBox,
} from '@hello.nrfcloud.com/proto'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	Context,
	HttpStatusCode,
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
import type { Job } from './Job.js'
import { toJobExecution } from './toJobExecution.js'

const {
	DevicesTableName,
	jobStatusTableName,
	jobStatusTableDeviceIndexName,
	version,
	responseCacheMaxAge,
} = fromEnv({
	DevicesTableName: 'DEVICES_TABLE_NAME',
	jobStatusTableName: 'JOB_STATUS_TABLE_NAME',
	jobStatusTableDeviceIndexName: 'JOB_STATUS_TABLE_DEVICE_INDEX_NAME',
	version: 'VERSION',
	responseCacheMaxAge: 'RESPONSE_CACHE_MAX_AGE',
})(process.env)

const db = new DynamoDBClient({})

const validateInput = validateWithTypeBox(
	Type.Object({
		id: deviceId,
		fingerprint: Type.RegExp(fingerprintRegExp),
	}),
)

const getDevice = getDeviceById({
	db,
	DevicesTableName,
})

const h = async (
	event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
	console.log(JSON.stringify({ event }))

	const maybeValidInput = validateInput({
		...(event.pathParameters ?? {}),
		...(event.queryStringParameters ?? {}),
	})
	if ('errors' in maybeValidInput) {
		return aProblem({
			title: 'Validation failed',
			status: HttpStatusCode.BAD_REQUEST,
			detail: formatTypeBoxErrors(maybeValidInput.errors),
		})
	}

	const maybeDevice = await getDevice(maybeValidInput.value.id)
	if ('error' in maybeDevice) {
		return aProblem({
			title: `No device found with ID!`,
			detail: maybeValidInput.value.id,
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

	const deviceJobs = await db.send(
		new QueryCommand({
			TableName: jobStatusTableName,
			IndexName: jobStatusTableDeviceIndexName,
			KeyConditionExpression: '#deviceId = :deviceId',
			ExpressionAttributeNames: {
				'#deviceId': 'deviceId',
				'#jobId': 'jobId',
			},
			ExpressionAttributeValues: {
				':deviceId': {
					S: device.id,
				},
			},
			ProjectionExpression: '#jobId',
			Limit: 10,
		}),
	)

	console.debug(JSON.stringify({ deviceJobs }))

	const jobs: Array<Job> = []

	if ((deviceJobs.Items ?? []).length > 0) {
		const jobDetails = await db.send(
			new BatchGetItemCommand({
				RequestItems: {
					[jobStatusTableName]: {
						Keys: deviceJobs.Items ?? [],
					},
				},
			}),
		)
		jobs.push(
			...(jobDetails.Responses?.[jobStatusTableName]?.map(
				(item) => unmarshall(item) as Job,
			) ?? []),
		)
		console.debug(JSON.stringify({ jobs }))
	}

	return aResponse(
		HttpStatusCode.OK,
		{
			'@context': Context.fotaJobExecutions,
			deviceId: device.id,
			jobs: jobs.map((job) => toJobExecution(job)),
		},
		parseInt(responseCacheMaxAge, 10),
	)
}

export const handler = middy()
	.use(addVersionHeader(version))
	.use(corsOPTIONS('GET'))
	.handler(h)