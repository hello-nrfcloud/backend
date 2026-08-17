import type { AttributeValue } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { fromEnv } from '@bifravst/from-env'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import type { DynamoDBStreamEvent } from 'aws-lambda'
import type { PersistedJob } from './jobRepo.ts'
import { toJob } from './toJobExecution.ts'

const { EventBusName } = fromEnv({
	EventBusName: 'EVENTBUS_NAME',
})(process.env)

const eventBus = new EventBridge({})

export const handler = middy<DynamoDBStreamEvent, void>()
	.use(requestLogger())
	.handler(async (event) => {
		for (const record of event.Records) {
			const newImage = record.dynamodb?.NewImage
			if (newImage === undefined) {
				continue
			}
			const job = unmarshall(
				newImage as Record<string, AttributeValue>,
			) as PersistedJob

			const message = toJob(job)

			console.debug('websocket message', JSON.stringify({ payload: message }))

			await eventBus.putEvents({
				Entries: [
					{
						EventBusName,
						Source: 'hello.ws',
						DetailType: Context.lwm2mObjectUpdate.toString(),
						Detail: JSON.stringify({
							deviceId: job.deviceId,
							message,
						}),
					},
				],
			})
		}
	})
