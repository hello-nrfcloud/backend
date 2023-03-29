import {
	DynamoDBClient,
	ExecuteStatementCommand,
	type ExecuteStatementCommandOutput,
} from '@aws-sdk/client-dynamodb'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { logger } from './logger.js'

const { connectionsTableName, queueUrl } = fromEnv({
	connectionsTableName: 'CONNECTIONS_TABLE_NAME',
	connectionsIndexName: 'CONNECTIONS_INDEX_NAME',
	queueUrl: 'QUEUE_URL',
})(process.env)

const CHUNK_SIZE = 50 // TONOTE:: 100 is the maximum number nRF Cloud ListDevice API support
const log = logger('prepareDeviceShadow')
const db = new DynamoDBClient({})
const queue = new SQSClient({})

export const handler = async (): Promise<void> => {
	log.info(`Getting all active devices`)
	// Get active devices
	const map = new Map()
	let res: ExecuteStatementCommandOutput
	let nextToken: string | undefined = undefined
	do {
		if (nextToken === undefined) {
			res = await db.send(
				new ExecuteStatementCommand({
					Statement: `select connectionId, deviceId, version from "${connectionsTableName}"`,
					Limit: CHUNK_SIZE,
				}),
			)
		} else {
			res = await db.send(
				new ExecuteStatementCommand({
					Statement: `select connectionId, deviceId, version from "${connectionsTableName}"`,
					NextToken: nextToken,
					Limit: CHUNK_SIZE,
				}),
			)
		}
		res.Items?.forEach((item) => {
			const data = unmarshall(item)
			map.set(data.connectionId, { ...data })
		})
		nextToken = res.NextToken
	} while (nextToken !== undefined)

	log.info(`Got ${map.size} active connections`)
	const sortedArray: [string, { connectionId: string; deviceId: string }][] = [
		...map.entries(),
	].sort((a, b) => a[0].localeCompare(b[0]))
	for (let i = 0; i < sortedArray.length; i += CHUNK_SIZE) {
		const chunk = sortedArray.slice(i, i + CHUNK_SIZE)
		const data = chunk.map((item) => {
			return item[1]
		})
		await queue.send(
			new SendMessageCommand({
				QueueUrl: queueUrl,
				MessageBody: JSON.stringify(data),
				MessageAttributes: {
					createdAt: { StringValue: `${Date.now()}`, DataType: 'Number' },
				},
			}),
		)
		log.info(`Send chunk #${i + 1} to queue`)
	}
}
