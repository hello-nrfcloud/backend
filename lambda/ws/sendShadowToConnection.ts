import {
	type EventBridgeClient,
	PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import type { Logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { type LwM2MObjectInstance } from '@hello.nrfcloud.com/proto-map/lwm2m'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import type { WebsocketPayload } from '../publishToWebsocketClients.js'

export const sendShadowToConnection =
	({
		eventBus,
		eventBusName,
		log,
	}: {
		eventBus: EventBridgeClient
		eventBusName: string
		log: Logger
	}) =>
	async ({
		connectionId,
		deviceId,
		shadow: { desired, reported },
	}: {
		deviceId: string
		shadow: {
			desired: Array<LwM2MObjectInstance>
			reported: Array<LwM2MObjectInstance>
		}
		model: string
		connectionId: string
	}): Promise<void> => {
		const payload: WebsocketPayload = {
			deviceId,
			connectionId,
			message: {
				'@context': Context.shadow.toString(),
				desired,
				reported,
			},
		}
		log.debug('Publish websocket message', payload)
		await eventBus.send(
			new PutEventsCommand({
				Entries: [
					{
						EventBusName: eventBusName,
						Source: 'hello.ws',
						DetailType: Context.shadow.toString(),
						Detail: JSON.stringify(payload),
					},
				],
			}),
		)
	}
