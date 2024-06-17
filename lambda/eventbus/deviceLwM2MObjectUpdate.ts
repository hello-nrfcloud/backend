import type { EventBridge } from '@aws-sdk/client-eventbridge'
import { type LwM2MObjectInstance } from '@hello.nrfcloud.com/proto-map/lwm2m'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import type { WebsocketPayload } from '../publishToWebsocketClients.js'

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
	): Promise<{ success: boolean } | { error: Error }> => {
		const message = {
			'@context': Context.lwm2mObjectUpdate.toString(),
			ObjectID,
			ObjectInstanceID,
			ObjectVersion,
			Resources,
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
		return { success: true }
	}
