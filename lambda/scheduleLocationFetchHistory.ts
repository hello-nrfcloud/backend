import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { locationHistorySyncRepository } from '../devices/locationHistorySyncRepository.js'
import { connectionsRepository } from '../websocket/connectionsRepository.js'

const {
	websocketDeviceConnectionsTableName,
	workQueueURL,
	locationHistorySyncTableName,
	maxHistoryHours,
} = fromEnv({
	websocketDeviceConnectionsTableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
	workQueueURL: 'WORK_QUEUE_URL',
	locationHistorySyncTableName: 'LOCATION_HISTORY_SYNC_TABLE_NAME',
	maxHistoryHours: 'MAX_AGE_HOURS',
})(process.env)

const db = new DynamoDBClient({})
const sqs = new SQSClient({})

const connectionsRepo = connectionsRepository(
	db,
	websocketDeviceConnectionsTableName,
)

const syncRepo = locationHistorySyncRepository(
	db,
	locationHistorySyncTableName,
	parseInt(maxHistoryHours, 10),
)

export const handler = async (): Promise<void> => {
	const activeConnections = await connectionsRepo.getAll()

	console.log(
		`Scheduling location history fetch for ${activeConnections.length} devices`,
	)

	for (const { deviceId, account } of activeConnections) {
		const range = await syncRepo.getAndUpdateFrom(deviceId)
		await sqs.send(
			new SendMessageCommand({
				QueueUrl: workQueueURL,
				MessageBody: JSON.stringify({
					deviceId,
					account,
					from: range.from.toISOString(),
					to: range.to.toISOString(),
				}),
			}),
		)
	}
}
