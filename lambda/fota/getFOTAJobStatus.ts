import {
	BatchGetItemCommand,
	DynamoDBClient,
	QueryCommand,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { fromEnv } from '@bifravst/from-env'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import {
	validateInput,
	type ValidInput,
} from '@hello.nrfcloud.com/lambda-helpers/validateInput'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import type { FOTAJobs } from '@hello.nrfcloud.com/proto/hello'
import {
	Context,
	HttpStatusCode,
	deviceId,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { Type, type Static } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { withDevice, type WithDevice } from '../middleware/withDevice.js'
import type { PersistedJob } from './jobRepo.js'
import { toJob } from './toJobExecution.js'

const {
	DevicesTableName,
	jobTableName,
	jobTableDeviceIdIndexName,
	version,
	responseCacheMaxAge,
} = fromEnv({
	DevicesTableName: 'DEVICES_TABLE_NAME',
	jobTableName: 'JOB_TABLE_NAME',
	jobTableDeviceIdIndexName: 'JOB_TABLE_DEVICE_ID_INDEX_NAME',
	version: 'VERSION',
	responseCacheMaxAge: 'RESPONSE_CACHE_MAX_AGE',
})(process.env)

const db = new DynamoDBClient({})

const InputSchema = Type.Object({
	deviceId,
	fingerprint: Type.RegExp(fingerprintRegExp),
})

const h = async (
	event: APIGatewayProxyEventV2,
	context: ValidInput<typeof InputSchema> & WithDevice,
): Promise<APIGatewayProxyResultV2> => {
	const deviceJobs = await db.send(
		new QueryCommand({
			TableName: jobTableName,
			IndexName: jobTableDeviceIdIndexName,
			KeyConditionExpression: '#deviceId = :deviceId',
			ExpressionAttributeNames: {
				'#deviceId': 'deviceId',
				'#pk': 'pk',
			},
			ExpressionAttributeValues: {
				':deviceId': {
					S: context.device.id,
				},
			},
			ProjectionExpression: '#pk',
			ScanIndexForward: false,
			// TODO: Implement pagination
			Limit: 10,
		}),
	)

	console.debug(JSON.stringify({ deviceJobs }))

	const jobs: Array<PersistedJob> = []

	if ((deviceJobs.Items ?? []).length > 0) {
		const jobDetails = await db.send(
			new BatchGetItemCommand({
				RequestItems: {
					[jobTableName]: {
						Keys: deviceJobs.Items ?? [],
					},
				},
			}),
		)
		jobs.push(
			...(jobDetails.Responses?.[jobTableName]?.map(
				(item) => unmarshall(item) as PersistedJob,
			) ?? []),
		)
		console.debug(JSON.stringify({ jobs }))
	}

	const res: Static<typeof FOTAJobs> = {
		'@context': Context.fotaJobs.toString(),
		deviceId: context.device.id,
		jobs: jobs
			.map((job) => toJob(job))
			.filter((job) => {
				if (context.device.hideDataBefore === undefined) return true
				return (
					new Date(job.timestamp).getTime() >=
					context.device.hideDataBefore.getTime()
				)
			})
			.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
	}

	return aResponse(
		HttpStatusCode.OK,
		{
			...res,
			'@context': Context.fotaJobs,
		},
		parseInt(responseCacheMaxAge, 10),
	)
}

export const handler = middy()
	.use(corsOPTIONS('GET'))
	.use(addVersionHeader(version))
	.use(requestLogger())
	.use(validateInput(InputSchema))
	.use(withDevice({ db, DevicesTableName }))
	.handler(h)
