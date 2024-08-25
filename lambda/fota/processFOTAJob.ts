import { MetricUnit } from '@aws-lambda-powertools/metrics'
import {
	DynamoDBClient,
	PutItemCommand,
	type AttributeValue,
} from '@aws-sdk/client-dynamodb'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { SSMClient } from '@aws-sdk/client-ssm'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { fromEnv } from '@bifravst/from-env'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import {
	createFOTAJob,
	FOTAJobStatus as NrfCloudFOTAJobStatus,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { FOTAJobStatus } from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import type { DynamoDBStreamEvent } from 'aws-lambda'
import { loggingFetch } from '../../util/loggingFetch.js'
import { getAllNRFCloudAPIConfigs } from '../nrfcloud/getAllNRFCloudAPIConfigs.js'
import { getDeviceFirmwareDetails } from './getDeviceFirmwareDetails.js'
import { getNextUpgrade } from './getNextUpgrade.js'
import { getByPK, update, type PersistedJob } from './jobRepo.js'
import type { NrfCloudFOTAJob } from './NrfCloudFOTAJob.js'

const { JobTableName, NrfCloudJobTableName, stackName, workQueueUrl } = fromEnv(
	{
		JobTableName: 'JOB_TABLE_NAME',
		NrfCloudJobTableName: 'NRF_CLOUD_JOB_TABLE_NAME',
		stackName: 'STACK_NAME',
		workQueueUrl: 'WORK_QUEUE_URL',
	},
)(process.env)

const db = new DynamoDBClient({})
const iotData = new IoTDataPlaneClient({})
const ssm = new SSMClient({})
const sqs = new SQSClient({})

const allNRFCloudAPIConfigs = getAllNRFCloudAPIConfigs({ ssm, stackName })()

const { track } = metricsForComponent('deviceFOTA')
const trackFetch = loggingFetch({ track, log: logger('deviceFOTA') })

const u = update(db, JobTableName)
const g = getByPK(db, JobTableName)
const d = getDeviceFirmwareDetails(iotData)

/**
 * Invoked when an entry in the FOTA Job table is updated.
 */
const h = async (event: DynamoDBStreamEvent): Promise<void> => {
	for (const record of event.Records) {
		const tableName = record.eventSourceARN?.split('/')[1] // arn:aws:dynamodb:eu-west-1:812555912232:table/hello-nrfcloud-backend-DeviceFOTAjobStatusTableC7E766BD-GC29G18CMQ8N/stream/2024-06-07T11:25:46.701
		const isJobUpdate = tableName === JobTableName
		const isNRFCloudUpdate = tableName === NrfCloudJobTableName

		if (!isJobUpdate && !isNRFCloudUpdate) {
			console.error(`Unknown table: ${tableName}`)
			continue
		}

		const newImage = unmarshall(
			record.dynamodb?.NewImage as {
				[key: string]: AttributeValue
			},
		)

		if (isJobUpdate) {
			return processJobUpdate(newImage as PersistedJob)
		}
		return processNRFCloudJobUpdate(newImage as NrfCloudFOTAJob)
	}
}

const processNRFCloudJobUpdate = async (nRfCloudJob: NrfCloudFOTAJob) => {
	const parent = await g(nRfCloudJob.parentJobId)
	if (parent === null) {
		console.error(`Parent job not found: ${nRfCloudJob.parentJobId}`)
		return
	}

	switch (nRfCloudJob.status) {
		case NrfCloudFOTAJobStatus.SUCCEEDED:
		case NrfCloudFOTAJobStatus.COMPLETED:
			await u(
				{
					status: FOTAJobStatus.IN_PROGRESS,
					statusDetail: `Upgrade job succeeded: ${nRfCloudJob.statusDetail} (${nRfCloudJob.jobId})`,
				},
				parent,
			)
			return
		case NrfCloudFOTAJobStatus.FAILED:
		case NrfCloudFOTAJobStatus.TIMED_OUT:
		case NrfCloudFOTAJobStatus.CANCELLED:
		case NrfCloudFOTAJobStatus.REJECTED:
			await u(
				{
					status: FOTAJobStatus.FAILED,
					statusDetail: `Job failed: ${nRfCloudJob.statusDetail} (${nRfCloudJob.jobId})`,
				},
				parent,
			)
			return
		default:
			await u(
				{
					status: FOTAJobStatus.FAILED,
					statusDetail: `Job failed: Unknown job status: ${nRfCloudJob.status} (${nRfCloudJob.jobId})`,
				},
				parent,
			)
			return
	}
}

const processJobUpdate = async (job: PersistedJob) => {
	try {
		const maybeFirmwareDetails = await d(job.deviceId, (...args) =>
			console.debug(
				`[FOTA:${job.deviceId}]`,
				...args.map((a) => JSON.stringify(a)),
			),
		)
		if ('error' in maybeFirmwareDetails) throw maybeFirmwareDetails.error
		const maybeBundleId = getNextUpgrade(
			job.upgradePath,
			maybeFirmwareDetails.details,
		)
		if ('error' in maybeBundleId) {
			throw maybeBundleId.error
		}

		const { bundleId, reportedVersion } = maybeBundleId.upgrade
		if (bundleId === null || job.usedVersions.has(reportedVersion)) {
			await u(
				{
					status: FOTAJobStatus.SUCCEEDED,
					statusDetail: `No further update defined.`,
					reportedVersion,
				},
				job,
			)
			return
		}

		const { apiKey, apiEndpoint } =
			(await allNRFCloudAPIConfigs)[job.account] ?? {}
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
			deviceId: job.deviceId,
			bundleId,
		})

		if (!('result' in res)) {
			throw new Error(`Failed to create job: ${res.error.message}.`)
		}

		console.debug(`Accepted`)
		track('success', MetricUnit.Count, 1)

		const now = new Date().toISOString()
		const nRFCloudJob: NrfCloudFOTAJob = {
			parentJobId: job.id,
			deviceId: job.deviceId,
			jobId: res.result.jobId,
			status: 'QUEUED',
			createdAt: now,
			lastUpdatedAt: now,
			nextUpdateAt: now,
			account: job.account,
			firmware: null,
			statusDetail: null,
			target: null,
		}

		await db.send(
			new PutItemCommand({
				TableName: NrfCloudJobTableName,
				Item: marshall({
					...nRFCloudJob,
					ttl: Math.round(Date.now() / 1000) + 60 * 60 * 24 * 30,
				}),
			}),
		)

		// Queue a job update right away
		await sqs.send(
			new SendMessageCommand({
				QueueUrl: workQueueUrl,
				MessageBody: JSON.stringify(job),
			}),
		)

		await u(
			{
				status: FOTAJobStatus.IN_PROGRESS,
				statusDetail: `Started job for version ${reportedVersion} with bundle ${bundleId}.`,
				reportedVersion,
				usedVersions: job.usedVersions.add(reportedVersion),
			},
			job,
		)
	} catch (error) {
		console.error(error)
		await u(
			{
				status: FOTAJobStatus.FAILED,
				statusDetail: (error as Error).message,
			},
			job,
		)
	}
}

export const handler = middy().use(requestLogger()).handler(h)
