import type { Logger } from '@aws-lambda-powertools/logger'
import { MetricUnits } from '@aws-lambda-powertools/metrics'
import {
	EventBridgeClient,
	PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import { proto } from '@hello.nrfcloud.com/proto/hello/model/PCA20035+solar'
import { type DeviceShadowType } from '../../nrfcloud/DeviceShadow.js'
import type { AddMetricsFn } from '../metrics/metrics.js'
import type { WebsocketPayload } from '../publishToWebsocketClients.js'

export const sendShadowToConnection =
	({
		eventBus,
		eventBusName,
		track,
		log,
	}: {
		eventBus: EventBridgeClient
		eventBusName: string
		track: AddMetricsFn
		log: Logger
	}) =>
	async ({
		model,
		connectionId,
		shadow,
	}: {
		shadow: DeviceShadowType
		model: string
		connectionId: string
	}): Promise<void> => {
		const converted = await proto({
			onError: (message, model, error) => {
				log.error(
					`Failed to convert message ${JSON.stringify(
						message,
					)} from model ${model}: ${error}`,
				)
				track('shadowConversionFailed', MetricUnits.Count, 1)
			},
		})(model, shadow.state)

		if (converted.length === 0) {
			log.debug('shadow was not converted to any message for device', {
				model,
				device: shadow.id,
			})
			return
		}

		await Promise.all(
			converted.map(async (message) => {
				const payload: WebsocketPayload = {
					deviceId: shadow.id,
					connectionId,
					message,
				}
				log.debug('Publish websocket message', payload)
				return eventBus.send(
					new PutEventsCommand({
						Entries: [
							{
								EventBusName: eventBusName,
								Source: 'thingy.ws',
								DetailType: 'message',
								Detail: JSON.stringify(payload),
							},
						],
					}),
				)
			}),
		)
	}
