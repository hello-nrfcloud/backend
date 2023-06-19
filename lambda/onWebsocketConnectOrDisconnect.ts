import {
	DeleteItemCommand,
	DynamoDBClient,
	PutItemCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import type { DeviceIdentity } from '@hello.nrfcloud.com/proto/hello/HelloMessage.js'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { Static } from '@sinclair/typebox'
import type { EventBridgeEvent } from 'aws-lambda'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from './util/logger.js'
const { connectionsTableName } = fromEnv({
	connectionsTableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
})(process.env)

const log = logger('DeviceTracking')
const db = new DynamoDBClient({})

export type PersistedDeviceSubscription = {
	deviceId: string
	connectionId: string
	model: string
	updatedAt: string
}

export const handler = async (
	event: EventBridgeEvent<'connect' | 'disconnect', WebsocketPayload>,
): Promise<void> => {
	log.info('DeviceTracking event', { event })

	if (event.detail.connectionId === undefined) {
		log.error(
			`${event.detail.deviceId} (${
				event.detail.connectionId ?? 'without connection id'
			}) is ${event['detail-type']}`,
		)
		return
	}

	let subscription: PersistedDeviceSubscription
	switch (event['detail-type']) {
		case 'connect':
			subscription = {
				deviceId: event.detail.deviceId,
				// Needed for Global Secondary Index
				updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
				connectionId: event.detail.connectionId,
				model: (event.detail.message as Static<typeof DeviceIdentity>).model,
			}
			await db.send(
				new PutItemCommand({
					TableName: connectionsTableName,
					Item: marshall(subscription),
				}),
			)
			break
		case 'disconnect':
			if (event.detail.connectionId !== undefined) {
				await db.send(
					new DeleteItemCommand({
						TableName: connectionsTableName,
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
}
