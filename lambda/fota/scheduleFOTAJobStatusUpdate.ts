import { MetricUnit } from '@aws-lambda-powertools/metrics'
import {
	DynamoDBClient,
	QueryCommand,
	UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { Job } from './Job.js'

const {
	version,
	jobStatusTableName,
	jobStatusTableStatusIndexName,
	workQueueUrl,
} = fromEnv({
	jobStatusTableName: 'JOB_STATUS_TABLE_NAME',
	jobStatusTableStatusIndexName: 'JOB_STATUS_TABLE_STATUS_INDEX_NAME',
	version: 'VERSION',
	workQueueUrl: 'WORK_QUEUE_URL',
})(process.env)

const db = new DynamoDBClient({})
const sqs = new SQSClient({})

const { track } = metricsForComponent('fotaStatusUpdate')

const h = async (): Promise<void> => {
	const res = await db.send(
		new QueryCommand({
			TableName: jobStatusTableName,
			IndexName: jobStatusTableStatusIndexName,
			KeyConditionExpression: '#status in :status AND #nextUpdateAt < :now',
			ExpressionAttributeNames: {
				'#status': 'status',
				'#jobId': 'jobId',
				'#nextUpdateAt': 'nextUpdateAt',
			},
			ExpressionAttributeValues: {
				':status': {
					SS: ['QUEUED', 'IN_PROGRESS', 'DOWNLOADING'],
				},
				':now': {
					S: new Date().toISOString(),
				},
			},
			ProjectionExpression: '#jobId, #nextUpdateAt',
		}),
	)

	const jobs = (res.Items?.map((item) => unmarshall(item)) ?? []) as Array<Job>

	console.log(JSON.stringify(jobs))

	track('jobs', MetricUnit.Count, jobs.length ?? 0)

	await Promise.all(
		jobs
			.map(async (job) => [
				db.send(
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
								S: nextUpdateAt(new Date(job.createdAt)).toISOString(),
							},
							':currentNextUpdateAt': {
								S: job.nextUpdateAt,
							},
						},
					}),
				),
				sqs.send(
					new SendMessageCommand({
						QueueUrl: workQueueUrl,
						MessageBody: JSON.stringify({
							job,
						}),
					}),
				),
			])
			.flat(),
	)
}

export const handler = middy().use(addVersionHeader(version)).handler(h)

/**
 * Calculate the next update time based on the age of the job.
 *
 * < 1 hour: 5 minutes
 * >= 1 hour: 1 hour
 */
const nextUpdateAt = (createdAt: Date): Date => {
	const deltaMinutes = (Date.now() - createdAt.getTime()) / 1000 / 60
	if (deltaMinutes < 60) {
		return new Date(createdAt.getTime() + 5 * 60 * 1000)
	}
	return new Date(createdAt.getTime() + 60 * 60 * 1000)
}
