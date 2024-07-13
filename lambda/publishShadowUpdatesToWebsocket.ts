import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { fromEnv } from '@bifravst/from-env'
import { shadowToObjects } from '@hello.nrfcloud.com/proto-map/lwm2m/aws'
import { getActiveConnections } from '../websocket/notifyClients.js'
import { sendShadowToConnection } from './ws/sendShadowToConnection.js'
import type { LwM2MShadow } from '@hello.nrfcloud.com/proto-map/lwm2m/aws'

const { connectionsTableName, EventBusName } = fromEnv({
	connectionsTableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
	EventBusName: 'EVENTBUS_NAME',
})(process.env)

const log = logger('publishShadowUpdatesToWebsocket')
const db = new DynamoDBClient({})
const eventBus = new EventBridge({})

const sendShadow = sendShadowToConnection({
	eventBus,
	eventBusName: EventBusName,
	log,
})

type UpdateAccepted = {
	deviceId: string
	model: string
	state: {
		desired: LwM2MShadow
		reported: LwM2MShadow
	}
}

export const handler = async (event: UpdateAccepted): Promise<void> => {
	log.debug({ event })

	const { deviceId, state: lwm2mShadow, model } = event

	const connectionIds = await getActiveConnections(
		db,
		connectionsTableName,
		deviceId,
	)
	log.debug(
		`${connectionIds.length} active connections found for device ${deviceId}.`,
	)

	for (const connectionId of connectionIds) {
		await sendShadow({
			deviceId,
			model,
			shadow: {
				desired: shadowToObjects(lwm2mShadow.desired ?? {}),
				reported: shadowToObjects(lwm2mShadow.reported ?? {}),
			},
			connectionId,
		})
	}
}
