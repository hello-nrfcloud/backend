import {
	EventBridgeClient,
	PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import { proto } from '@bifravst/muninn-proto/Muninn'
import type { Device } from './devicesRepository.js'
import type { DeviceShadow } from './getDeviceShadowFromnRFCloud.js'
import { logger } from './logger.js'
import type { WebsocketPayload } from './publishToWebsocketClients'

const log = logger('deviceShadowPublisher')
const eventBus = new EventBridgeClient({})

export const createDeviceShadowPublisher = (eventBusName: string) => {
	return async (device: Device, shadow: DeviceShadow): Promise<void> => {
		const model = device.device.model ?? 'default'
		const converted = await proto({
			onError: (message, model, error) =>
				log.error(
					`Failed to convert message ${JSON.stringify(
						message,
					)} from model ${model}: ${error}`,
				),
		})(model, shadow.state)

		if (converted.length === 0) {
			log.debug('shadow was not converted to any message for device', {
				model,
				device: device.deviceId,
			})
		} else {
			log.info(
				`Sending device shadow of ${device.deviceId}(v.${
					device?.version ?? 0
				}) with shadow data version ${shadow.state.version}`,
			)
		}

		await Promise.all(
			converted.map(async (message) => {
				log.debug('Publish websocket message', {
					deviceId: device.deviceId,
					connectionId: device.connectionId,
					message,
				})
				return eventBus.send(
					new PutEventsCommand({
						Entries: [
							{
								EventBusName: eventBusName,
								Source: 'thingy.ws',
								DetailType: 'message',
								Detail: JSON.stringify(<WebsocketPayload>{
									deviceId: device.deviceId,
									connectionId: device.connectionId,
									message,
								}),
							},
						],
					}),
				)
			}),
		)
	}
}
