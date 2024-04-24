import {
	EventBridgeClient,
	PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import type { DeviceShadowType } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import type { WebsocketPayload } from '../publishToWebsocketClients.js'
import type { Logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { Context, type ShadowType } from '@hello.nrfcloud.com/proto/hello'

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
		shadow,
	}: {
		shadow: DeviceShadowType
		model: string
		connectionId: string
	}): Promise<void> => {
		const { reported, desired, version } = shadow.state
		const connected = (reported?.connection?.status ?? '') === 'connected'

		const message: ShadowType = {
			'@context': Context.shadow.toString(),
			connected,
			version,
			desired,
			reported,
			updatedAt: shadow.$meta.updatedAt,
		}

		const payload: WebsocketPayload = {
			deviceId: shadow.id,
			connectionId,
			message,
		}
		log.debug('Publish websocket message', payload)
		await eventBus.send(
			new PutEventsCommand({
				Entries: [
					{
						EventBusName: eventBusName,
						Source: 'hello.ws',
						DetailType: 'message',
						Detail: JSON.stringify(payload),
					},
				],
			}),
		)
	}
