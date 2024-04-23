import { MetricUnit } from '@aws-lambda-powertools/metrics'
import {
	EventBridgeClient,
	PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import { proto } from '@hello.nrfcloud.com/proto/hello/model/PCA20065'
import type { DeviceShadowType } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import type { WebsocketPayload } from '../publishToWebsocketClients.js'
import type { AddMetricsFn } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import type { Logger } from '@hello.nrfcloud.com/lambda-helpers/logger'

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
				track('shadowConversionFailed', MetricUnit.Count, 1)
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
								Source: 'hello.ws',
								DetailType: 'message',
								Detail: JSON.stringify(payload),
							},
						],
					}),
				)
			}),
		)
	}
