import {
	DeleteItemCommand,
	DynamoDBClient,
	PutItemCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type {
	APIGatewayProxyStructuredResultV2,
	EventBridgeEvent,
} from 'aws-lambda'
import { logger } from './logger.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
const { DevicesTableName } = fromEnv({
	DevicesTableName: 'DEVICES_TABLE_NAME',
})(process.env)

const log = logger('DeviceTracking')
const db = new DynamoDBClient({})

export const handler = async (
	event: EventBridgeEvent<'connect' | 'disconnect', WebsocketPayload>,
): Promise<APIGatewayProxyStructuredResultV2> => {
	log.info('DeviceTracking event', { event })

	log.info(
		`${event.detail.deviceId} (${
			event.detail.connectionId ?? 'without connection id'
		}) is ${event['detail-type']}`,
	)

	const deviceData = { ...event.detail.message }
	delete deviceData['@context']
	switch (event['detail-type']) {
		case 'connect':
			await db.send(
				new PutItemCommand({
					TableName: DevicesTableName,
					Item: marshall({
						deviceId: event.detail.deviceId,
						connectionId: event.detail.connectionId,
						device: deviceData,
						createdAt: new Date().toISOString(),
						updatedAt: new Date(1900, 1, 1).toISOString(),
					}),
				}),
			)
			break
		case 'disconnect':
			if (event.detail.connectionId !== undefined) {
				await db.send(
					new DeleteItemCommand({
						TableName: DevicesTableName,
						Key: {
							deviceId: { S: event.detail.deviceId },
							connectionId: { S: event.detail.connectionId },
						},
					}),
				)
			}
			break
		default:
			log.warn(`Event is not recognized`, { event })
	}

	return {
		statusCode: 200,
	}
}
