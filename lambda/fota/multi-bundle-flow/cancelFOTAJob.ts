import {
	DynamoDBClient,
	QueryCommand,
	type AttributeValue,
} from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { fromEnv } from '@bifravst/from-env'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import {
	cancelFOTAJob,
	FOTAJobStatus,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import middy from '@middy/core'
import type { DynamoDBStreamEvent } from 'aws-lambda'
import { getAllNRFCloudAPIConfigs } from '../../nrfcloud/getAllNRFCloudAPIConfigs.js'
import type { PersistedJob } from '../jobRepo.js'
import type { NrfCloudFOTAJob } from '../NrfCloudFOTAJob.js'

const { stackName, jobStatusTableName, parentJobIdIndexName } = fromEnv({
	stackName: 'STACK_NAME',
	jobStatusTableName: 'NRF_CLOUD_JOB_STATUS_TABLE_NAME',
	parentJobIdIndexName: 'NRF_CLOUD_JOB_STATUS_TABLE_PARENT_JOB_ID_INDEX_NAME',
})(process.env)

const ssm = new SSMClient({})
const db = new DynamoDBClient({})

const allNRFCloudAPIConfigs = getAllNRFCloudAPIConfigs({ ssm, stackName })()

const h = async (event: DynamoDBStreamEvent): Promise<void> => {
	for (const record of event.Records) {
		const newImage = record.dynamodb?.NewImage
		if (newImage === undefined) {
			continue
		}
		const job = unmarshall(
			newImage as Record<string, AttributeValue>,
		) as PersistedJob

		const { Items: jobs } = await db.send(
			new QueryCommand({
				TableName: jobStatusTableName,
				IndexName: parentJobIdIndexName,
				KeyConditionExpression: 'parentJobId = :parentJobId	',
				ExpressionAttributeValues: {
					':parentJobId': {
						S: job.pk,
					},
				},
			}),
		)

		if (jobs?.length === 0) {
			console.debug(`No nRF Cloud jobs found for job ${job.pk}`)
			continue
		}

		const { apiKey, apiEndpoint } =
			(await allNRFCloudAPIConfigs)[job.account] ?? {}
		if (apiKey === undefined || apiEndpoint === undefined)
			throw new Error(`nRF Cloud API key for ${job.account} is not configured.`)

		for (const job of jobs ?? []) {
			const nrfCloudJob = unmarshall(job) as Pick<
				NrfCloudFOTAJob,
				'jobId' | 'status'
			>
			console.log(JSON.stringify(nrfCloudJob))
			if (
				![
					FOTAJobStatus.DOWNLOADING,
					FOTAJobStatus.IN_PROGRESS,
					FOTAJobStatus.QUEUED,
				].includes(nrfCloudJob.status)
			) {
				console.debug(
					`Job ${nrfCloudJob.jobId} is in status ${nrfCloudJob.status}, no action needed.`,
				)
				continue
			}
			const cancelJob = cancelFOTAJob({
				endpoint: apiEndpoint,
				apiKey,
			})

			const res = await cancelJob(nrfCloudJob.jobId)
			if (!('success' in res)) {
				console.error(`Failed to cancel job: ${res.error.message}.`)
			} else {
				console.log(`Cancelled job ${nrfCloudJob.jobId}.`)
			}
		}
	}
}

export const handler = middy().use(requestLogger()).handler(h)
