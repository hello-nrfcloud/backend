import { MetricUnit } from '@aws-lambda-powertools/metrics'
import {
	DynamoDBClient,
	QueryCommand,
	UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { fromEnv } from '@bifravst/from-env'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import middy from '@middy/core'
import type { Job } from './Job.js'

const {
	jobStatusTableName,
	jobStatusTableStatusIndexName,
	workQueueUrl,
	freshIntervalSeconds,
} = fromEnv({
	jobStatusTableName: 'JOB_STATUS_TABLE_NAME',
	jobStatusTableStatusIndexName: 'JOB_STATUS_TABLE_STATUS_INDEX_NAME',
	version: 'VERSION',
	workQueueUrl: 'WORK_QUEUE_URL',
	freshIntervalSeconds: 'FRESH_INTERVAL_SECONDS',
})(process.env)

const db = new DynamoDBClient({})
const sqs = new SQSClient({})

const { track } = metricsForComponent('fotaStatusUpdate')

const h = async (): Promise<void> => {
	const pendingJobs = (
		await Promise.all(
			['QUEUED', 'IN_PROGRESS', 'DOWNLOADING'].map(async (status) =>
				db
					.send(
						new QueryCommand({
							TableName: jobStatusTableName,
							IndexName: jobStatusTableStatusIndexName,
							KeyConditionExpression:
								'#status = :status AND #nextUpdateAt < :now',
							ExpressionAttributeNames: {
								'#status': 'status',
								'#jobId': 'jobId',
								'#nextUpdateAt': 'nextUpdateAt',
								'#createdAt': 'createdAt',
							},
							ExpressionAttributeValues: {
								':status': {
									S: status,
								},
								':now': {
									S: new Date().toISOString(),
								},
							},
							ProjectionExpression: '#jobId, #nextUpdateAt, #createdAt',
						}),
					)
					.then(({ Items }) => Items ?? []),
			),
		)
	).flat()

	const jobs = pendingJobs.map((item) => unmarshall(item)) as Array<
		Pick<Job, 'jobId' | 'nextUpdateAt' | 'createdAt'>
	>

	console.log(JSON.stringify(jobs))

	track('jobs', MetricUnit.Count, jobs.length ?? 0)

	await Promise.all(
		jobs.map(async (job) => {
			const res = await db.send(
				new UpdateItemCommand({
					TableName: jobStatusTableName,
					Key: {
						jobId: {
							S: job.jobId,
						},
					},
					UpdateExpression: 'SET #nextUpdateAt = :nextUpdateAt',
					ConditionExpression: '#nextUpdateAt = :currentNextUpdateAt',
					ExpressionAttributeNames: {
						'#nextUpdateAt': 'nextUpdateAt',
					},
					ExpressionAttributeValues: {
						':nextUpdateAt': {
							S: nextUpdateAt(
								new Date(job.createdAt),
								parseInt(freshIntervalSeconds, 10),
							).toISOString(),
						},
						':currentNextUpdateAt': {
							S: job.nextUpdateAt,
						},
					},
					ReturnValues: 'ALL_OLD',
				}),
			)
			await sqs.send(
				new SendMessageCommand({
					QueueUrl: workQueueUrl,
					MessageBody: JSON.stringify(unmarshall(res.Attributes ?? {})),
				}),
			)
		}),
	)
}

export const handler = middy().use(requestLogger()).handler(h)

/**
 * Calculate the next update time based on the age of the job.
 *
 * < 1 hour: 5 minutes
 * >= 1 hour: 1 hour
 */
const nextUpdateAt = (
	createdAt: Date,
	// The interval between updates if a Job is considered fresh
	freshIntervalSeconds = 5 * 60,
	// The age in minutes at which a Job is considered fresh
	freshnessAgeMinutes = 60,
): Date => {
	const deltaMinutes = (Date.now() - createdAt.getTime()) / 1000 / 60
	if (deltaMinutes < freshnessAgeMinutes) {
		return new Date(createdAt.getTime() + freshIntervalSeconds * 1000)
	}
	return new Date(createdAt.getTime() + 60 * 60 * 1000)
}
