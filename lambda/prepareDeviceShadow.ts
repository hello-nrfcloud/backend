import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { fromEnv } from '@nordicsemiconductor/from-env'

const { queueUrl } = fromEnv({
	queueUrl: 'QUEUE_URL',
})(process.env)

const queue = new SQSClient({})
const heartbeat = 5 // 5 seconds

export const handler = async (): Promise<void> => {
	const count = Math.floor(60 / heartbeat)
	const currDate = Date.now()
	for (let i = 0; i < count; i++) {
		const delay = i * heartbeat
		await queue.send(
			new SendMessageCommand({
				DelaySeconds: delay,
				QueueUrl: queueUrl,
				MessageBody: JSON.stringify({
					heartbeat,
					createdAt: new Date(),
					executedAt: new Date(currDate + delay * 1000),
				}),
			}),
		)
	}
}
