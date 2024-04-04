import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { Context, DeviceIdentity } from '@hello.nrfcloud.com/proto/hello'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { Static } from '@sinclair/typebox'
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { lastSeenRepo } from '../lastSeen/lastSeenRepo.js'
import { connectionsRepository } from '../websocket/connectionsRepository.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import type { AuthorizedEvent } from './ws/AuthorizedEvent.js'
import { get } from '../nrfcloud/deviceShadowRepo.js'
import { sendShadowToConnection } from './ws/sendShadowToConnection.js'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'

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

const repo = connectionsRepository(db, TableName)
const { getLastSeenOrNull } = lastSeenRepo(db, LastSeenTableName)

const getShadow = get({ db, TableName: deviceShadowTableName })
const { track } = metricsForComponent('shadowFetcher')
const sendShadow = sendShadowToConnection({
	eventBus,
	eventBusName: EventBusName,
	log,
	track,
})

export const handler = async (
	event: AuthorizedEvent,
): Promise<APIGatewayProxyStructuredResultV2> => {
	log.debug('event', { event })
	const context = event.requestContext.authorizer
	const { connectionId } = event.requestContext
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
				Source: 'thingy.ws',
				DetailType: 'connect',
				Detail: JSON.stringify(<WebsocketPayload>{
					deviceId,
					connectionId,
					message,
				}),
			},
		],
	})

	if (context.model === 'unsupported') {
		log.debug(`Unsupported device, not fetching shadow.`, {
			deviceId,
			connectionId,
		})
	} else {
		const { shadow } = await getShadow(deviceId)
		if (shadow !== null) {
			log.debug(`sending shadow`, {
				deviceId,
				connectionId,
			})
			await sendShadow({
				model,
				shadow,
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
