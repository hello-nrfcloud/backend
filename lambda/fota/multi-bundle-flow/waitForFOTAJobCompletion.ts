import type { AttributeValue } from '@aws-sdk/client-dynamodb'
import {
	SendTaskFailureCommand,
	SendTaskSuccessCommand,
	SFNClient,
} from '@aws-sdk/client-sfn'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import {
	FOTAJobStatus,
	type FOTAJobType,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import middy from '@middy/core'
import type { Static } from '@sinclair/typebox'
import type { DynamoDBStreamEvent } from 'aws-lambda'

const sfn = new SFNClient({})

const h = async (event: DynamoDBStreamEvent): Promise<void> => {
	for (const record of event.Records) {
		const newImage = record.dynamodb?.NewImage
		if (newImage === undefined) {
			continue
		}
		const job = unmarshall(
			newImage as Record<string, AttributeValue>,
		) as Static<typeof FOTAJobType> & {
			waitForFOTAJobCompletionTaskToken: string
		}

		switch (job.status) {
			case FOTAJobStatus.COMPLETED:
			case FOTAJobStatus.SUCCEEDED:
				await sfn.send(
					new SendTaskSuccessCommand({
						taskToken: job.waitForFOTAJobCompletionTaskToken,
						output: JSON.stringify(job),
					}),
				)
				break
			case FOTAJobStatus.FAILED:
			case FOTAJobStatus.CANCELLED:
			case FOTAJobStatus.TIMED_OUT:
			case FOTAJobStatus.REJECTED:
				await sfn.send(
					new SendTaskFailureCommand({
						taskToken: job.waitForFOTAJobCompletionTaskToken,
						error: 'JobFailed',
						cause: `Job ${job.jobId} failed with status ${job.status}`,
					}),
				)
				break
			default:
				console.debug(`Job ${job.jobId} is still in progress: ${job.status}`)
		}
	}
}

export const handler = middy().use(requestLogger()).handler(h)
