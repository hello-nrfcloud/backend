import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { fromEnv } from '@bifravst/from-env'
import { connectionsRepository } from '../../websocket/connectionsRepository.js'
import { memfaultRebootSyncRepository } from '../../devices/memfaultRebootSyncRepository.js'

const {
	websocketDeviceConnectionsTableName,
	workQueueURL,
	syncTable,
	maxHistoryHours,
} = fromEnv({
	websocketDeviceConnectionsTableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
	workQueueURL: 'WORK_QUEUE_URL',
	syncTable: 'SYNC_TABLE_NAME',
	maxHistoryHours: 'MAX_AGE_HOURS',
})(process.env)

const db = new DynamoDBClient({})
const sqs = new SQSClient({})

const connectionsRepo = connectionsRepository(
	db,
	websocketDeviceConnectionsTableName,
)

const syncRepo = memfaultRebootSyncRepository(
	db,
	syncTable,
	parseInt(maxHistoryHours, 10),
)

export const handler = async (): Promise<void> => {
	const activeConnections = await connectionsRepo.getAll()

	console.log(
		`Scheduling reboot history fetch for ${activeConnections.length} devices`,
		activeConnections.map(({ deviceId }) => deviceId).join(', '),
	)

	for (const { deviceId, account } of activeConnections) {
		const range = await syncRepo.getAndUpdateFrom(deviceId)
		await sqs.send(
			new SendMessageCommand({
				QueueUrl: workQueueURL,
				MessageBody: JSON.stringify({
					deviceId,
					account,
					since: range.since.toISOString(),
				}),
			}),
		)
	}
}
