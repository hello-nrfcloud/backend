import type { AttributeValue } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { requestLogger } from '../middleware/requestLogger.js'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { DynamoDBStreamEvent } from 'aws-lambda'
import type { WebsocketPayload } from '../publishToWebsocketClients.js'
import type { Job } from './Job.js'
import { toJobExecution } from './toJobExecution.js'

const { EventBusName } = fromEnv({
	EventBusName: 'EVENTBUS_NAME',
})(process.env)

const eventBus = new EventBridge({})

const h = async (event: DynamoDBStreamEvent): Promise<void> => {
	console.debug(JSON.stringify({ event }))

	for (const record of event.Records) {
		const newImage = record.dynamodb?.NewImage
		if (newImage === undefined) {
			continue
		}
		const job = unmarshall(newImage as Record<string, AttributeValue>) as Job

		const message = toJobExecution(job)

		console.debug('websocket message', JSON.stringify({ payload: message }))

		await eventBus.putEvents({
			Entries: [
				{
					EventBusName,
					Source: 'hello.ws',
					DetailType: Context.lwm2mObjectUpdate.toString(),
					Detail: JSON.stringify(<WebsocketPayload>{
						deviceId: job.deviceId,
						message,
					}),
				},
			],
		})
	}
}

export const handler = middy().use(requestLogger()).handler(h)