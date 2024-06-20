import {
	BatchGetItemCommand,
	DynamoDBClient,
	QueryCommand,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	Context,
	HttpStatusCode,
	deviceId,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import inputOutputLogger from '@middy/input-output-logger'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { Type } from '@sinclair/typebox'
import type { APIGatewayProxyResultV2 } from 'aws-lambda'
import { validateInput } from '../middleware/validateInput.js'
import { withDevice, type WithDevice } from '../middleware/withDevice.js'
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

const InputSchema = Type.Object({
	deviceId,
	fingerprint: Type.RegExp(fingerprintRegExp),
})

const h = async (event: WithDevice): Promise<APIGatewayProxyResultV2> => {
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
					S: event.device.id,
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
			deviceId: event.device.id,
			jobs: jobs.map((job) => toJobExecution(job)),
		},
		parseInt(responseCacheMaxAge, 10),
	)
}

export const handler = middy()
	.use(inputOutputLogger())
	.use(addVersionHeader(version))
	.use(corsOPTIONS('GET'))
	.use(validateInput(InputSchema))
	.use(withDevice({ db, DevicesTableName }))
	.handler(h)
