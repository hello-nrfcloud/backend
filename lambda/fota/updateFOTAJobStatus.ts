import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { marshall } from '@aws-sdk/util-dynamodb'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import {
	FetchError,
	getFOTAJob,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { getAllAccountsSettings as getAllNRFCloudAccountSettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { SQSEvent } from 'aws-lambda'
import { loggingFetch } from '../loggingFetch.js'
import type { Job } from './Job.js'

const { stackName, jobStatusTableName } = fromEnv({
	stackName: 'STACK_NAME',
	jobStatusTableName: 'JOB_STATUS_TABLE_NAME',
})(process.env)

const { track, metrics } = metricsForComponent('updateFOTAJob')

const ssm = new SSMClient({})

const allNRFCloudAccountSettings = await getAllNRFCloudAccountSettings({
	ssm,
	stackName,
})

const jobFetcher = new Map<string, ReturnType<typeof getFOTAJob>>()
const log = logger('updateFOTAJob')
for (const [account, { apiEndpoint, apiKey }] of Object.entries(
	allNRFCloudAccountSettings,
)) {
	jobFetcher.set(
		account,
		getFOTAJob({ endpoint: apiEndpoint, apiKey }, loggingFetch({ track, log })),
	)
}

const db = new DynamoDBClient({})

const h = async (event: SQSEvent): Promise<void> => {
	log.debug('event', event)

	for (const record of event.Records) {
		const {
			jobId,
			account,
			lastUpdatedAt: currentLastUpdatedAt,
			createdAt,
		} = JSON.parse(record.body) as Job

		if (jobId === undefined || account === undefined) {
			log.error('Missing required attributes')
			track('error', MetricUnit.Count, 1)
			continue
		}
		const fetcher = jobFetcher.get(account)
		if (fetcher === undefined) {
			log.error(`No fetcher defined for ${account}!`)
			track('error', MetricUnit.Count, 1)
			continue
		}

		const maybeJob = await fetcher({ jobId })
		if ('error' in maybeJob) {
			if (
				maybeJob.error instanceof FetchError &&
				maybeJob.error.statusCode === 404
			) {
				console.debug(`FOTA job ${jobId} not found!`, maybeJob.error)
				// Mark the job as failed
				if (Date.now() - new Date(createdAt).getTime() > 24 * 60 * 60 * 1000) {
					await db.send(
						new UpdateItemCommand({
							TableName: jobStatusTableName,
							Key: {
								jobId: {
									S: jobId,
								},
							},
							UpdateExpression:
								'SET #lastUpdatedAt = :lastUpdatedAt, #status = :status, #statusDetail = :statusDetail',
							ExpressionAttributeNames: {
								'#lastUpdatedAt': 'lastUpdatedAt',
								'#status': 'status',
								'#statusDetail': 'statusDetail',
							},
							ExpressionAttributeValues: {
								':lastUpdatedAt': {
									S: new Date().toISOString(),
								},
								':status': {
									S: 'FAILED',
								},
								':statusDetail': {
									S: 'The job was not found on nRF Cloud. It may have been deleted.',
								},
							},
						}),
					)
				}
			} else {
				console.error(`Fetching the FOTA job failed!`, maybeJob.error)
			}
			continue
		}
		const job = maybeJob.result
		track('success', MetricUnit.Count, 1)
		log.debug('job', job)

		const { firmware, lastUpdatedAt, status, statusDetail, target } = job

		await db.send(
			new UpdateItemCommand({
				TableName: jobStatusTableName,
				Key: {
					jobId: {
						S: jobId,
					},
				},
				UpdateExpression:
					'SET #firmware = :firmware, #lastUpdatedAt = :lastUpdatedAt, #status = :status, #statusDetail = :statusDetail, #target = :target',
				ExpressionAttributeNames: {
					'#firmware': 'firmware',
					'#lastUpdatedAt': 'lastUpdatedAt',
					'#status': 'status',
					'#statusDetail': 'statusDetail',
					'#target': 'target',
				},
				ExpressionAttributeValues: {
					':lastUpdatedAt': {
						S: lastUpdatedAt ?? currentLastUpdatedAt,
					},
					':status': {
						S: status,
					},
					':statusDetail':
						statusDetail !== undefined ? { S: statusDetail } : { NULL: true },
					':firmware':
						firmware !== undefined
							? {
									M: marshall(firmware, { convertEmptyValues: true }),
								}
							: { NULL: true },
					':target':
						target !== undefined
							? {
									M: marshall(target, { convertEmptyValues: true }),
								}
							: { NULL: true },
				},
			}),
		)
	}
}

export const handler = middy(h).use(logMetrics(metrics))
