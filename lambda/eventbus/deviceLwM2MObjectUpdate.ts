import type { EventBridge } from '@aws-sdk/client-eventbridge'
import type { WebsocketPayload } from '../publishToWebsocketClients.js'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import type { Static } from '@sinclair/typebox'
import type { Resources as LwM2MResources } from '@hello.nrfcloud.com/proto-map/api'
import type { LwM2MObjectInstance } from '@hello.nrfcloud.com/proto-map/lwm2m'

export const deviceLwM2MObjectUpdate =
	(eventBus: EventBridge, EventBusName: string) =>
	async (
		deviceId: string,
		{
			ObjectID,
			ObjectInstanceID,
			ObjectVersion,
			Resources,
		}: LwM2MObjectInstance,
	): Promise<void> => {
		const message = {
			'@context': Context.lwm2mObjectUpdate.toString(),
			ObjectID,
			ObjectInstanceID,
			ObjectVersion,
			Resources: {
				...(Resources as Static<typeof LwM2MResources>),
				[99]: Resources['99'],
			},
		}
		console.debug('websocket message', JSON.stringify({ payload: message }))
		await eventBus.putEvents({
			Entries: [
				{
					EventBusName,
					Source: 'hello.ws',
					DetailType: Context.lwm2mObjectUpdate.toString(),
					Detail: JSON.stringify(<WebsocketPayload>{
						deviceId,
						message,
					}),
				},
			],
		})
	}
