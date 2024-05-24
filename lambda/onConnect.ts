import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { Context, type DeviceIdentity } from '@hello.nrfcloud.com/proto/hello'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { Static } from '@sinclair/typebox'
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { lastSeenRepo } from '../lastSeen/lastSeenRepo.js'
import { connectionsRepository } from '../websocket/connectionsRepository.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import type { AuthorizedEvent } from './ws/AuthorizedEvent.js'
import { get } from '../devices/deviceShadowRepo.js'
import { sendShadowToConnection } from './ws/sendShadowToConnection.js'
import {
	GetThingShadowCommand,
	IoTDataPlaneClient,
} from '@aws-sdk/client-iot-data-plane'
import { shadowToObjects } from '../lwm2m/shadowToObjects.js'

const { EventBusName, TableName, LastSeenTableName, deviceShadowTableName } =
	fromEnv({
		EventBusName: 'EVENTBUS_NAME',
		TableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
		LastSeenTableName: 'LAST_SEEN_TABLE_NAME',
		deviceShadowTableName: 'DEVICE_SHADOW_TABLE_NAME',
	})(process.env)

const log = logger('connect')
const eventBus = new EventBridge({})
const db = new DynamoDBClient({})
const iotData = new IoTDataPlaneClient({})

const repo = connectionsRepository(db, TableName)
const { getLastSeenOrNull } = lastSeenRepo(db, LastSeenTableName)

const getShadow = get({ db, TableName: deviceShadowTableName })
const sendShadow = sendShadowToConnection({
	eventBus,
	eventBusName: EventBusName,
	log,
})

export const handler = async (
	event: AuthorizedEvent,
): Promise<APIGatewayProxyStructuredResultV2> => {
	log.debug('event', { event })
	const context = event.requestContext.authorizer
	const { connectionId } = event.requestContext
	log.debug('ws:connect', connectionId)
	const { deviceId, model } = context
	if ('account' in context) {
		const { account } = context
		await repo.add({
			deviceId,
			model,
			account,
			connectionId,
			ttl: Math.round(Date.now() / 1000) + 5 * 60,
		})
	}

	const message: Static<typeof DeviceIdentity> = {
		'@context': Context.deviceIdentity.toString(),
		model,
		id: deviceId,
		lastSeen: (await getLastSeenOrNull(deviceId))?.toISOString() ?? undefined,
	}

	log.debug('websocket message', { message })
	await eventBus.putEvents({
		Entries: [
			{
				EventBusName,
				Source: 'hello.ws',
				DetailType: Context.deviceIdentity.toString(),
				Detail: JSON.stringify(<WebsocketPayload>{
					deviceId,
					connectionId,
					message,
				}),
			},
		],
	})

	// Send the LwM2M shadow
	const { payload } = await iotData.send(
		new GetThingShadowCommand({
			shadowName: 'lwm2m',
			thingName: deviceId,
		}),
	)
	if (payload !== undefined) {
		const shadow = JSON.parse(new TextDecoder('utf-8').decode(payload))
		log.debug('sending shadow', {
			deviceId,
			connectionId,
		})
		await sendShadow({
			deviceId,
			model,
			shadow: {
				desired: shadowToObjects(shadow.state.desired ?? {}),
				reported: shadowToObjects(shadow.state.reported ?? {}),
			},
			connectionId,
		})
	}

	// Send the shadow that is stored on nRF Cloud, which is the one that the device writes
	// This is used for device configuration.
	if (context.model === 'unsupported') {
		log.debug(`Unsupported device, not fetching shadow.`, {
			deviceId,
			connectionId,
		})
	} else {
		const { shadow } = await getShadow(deviceId)
		if (shadow !== null) {
			log.debug(`sending shadow from nRF Cloud`, {
				deviceId,
				connectionId,
			})
			await sendShadow({
				deviceId,
				model,
				shadow: {
					desired: shadowToObjects(shadow.state.desired?.lwm2m ?? {}),
					reported: shadowToObjects(shadow.state.reported?.lwm2m ?? {}),
				},
				connectionId,
			})
		} else {
			log.debug('no shadow found', {
				deviceId,
				connectionId,
			})
		}
	}

	return {
		statusCode: 200,
	}
}
