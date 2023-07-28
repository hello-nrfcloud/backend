import { MetricUnits, logMetrics } from '@aws-lambda-powertools/metrics'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import {
	BadRequestError,
	ConfigureDevice,
	Context,
	DeviceConfigured,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { EventBridgeEvent } from 'aws-lambda'
import { metricsForComponent } from './metrics/metrics.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from './util/logger.js'
import type { Static } from '@sinclair/typebox'
import { slashless } from '../util/slashless.js'
import { getNrfCloudAPIConfig } from './getNrfCloudAPIConfig.js'

type Request = Omit<WebsocketPayload, 'message'> & {
	message: {
		model: string
		request: Static<typeof ConfigureDevice>
	}
}

const { EventBusName, stackName } = fromEnv({
	EventBusName: 'EVENTBUS_NAME',
	stackName: 'STACK_NAME',
})(process.env)

const log = logger('configureDevice')
const eventBus = new EventBridge({})

const { track, metrics } = metricsForComponent('configureDevice')

/**
 * Handle configure device request
 */
const h = async (
	event: EventBridgeEvent<
		'https://github.com/hello-nrfcloud/proto/configure-device', // Context.configureDevice.toString()
		Request
	>,
): Promise<void> => {
	log.info('event', { event })
	const { apiEndpoint, apiKey } = await getNrfCloudAPIConfig(stackName)

	const {
		deviceId,
		message: {
			request: {
				configuration: { gnss },
			},
		},
	} = event.detail

	if (gnss === true) {
		track('gnss:on', MetricUnits.Count, 1)
	} else {
		track('gnss:off', MetricUnits.Count, 1)
	}

	const url = `${slashless(apiEndpoint)}/v1/devices/${encodeURIComponent(
		deviceId,
	)}/state`
	const body = {
		desired: {
			config: {
				nod: gnss === false ? ['gnss'] : null,
			},
		},
	}
	log.debug(`url`, url)
	log.debug(`body`, body)

	const res = await fetch(url, {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(body),
	})

	if (res.ok) {
		log.debug(`Accepted`)
		const message: Static<typeof DeviceConfigured> = {
			...event.detail.message.request,
			'@context': Context.deviceConfigured.toString(),
		}
		await eventBus.putEvents({
			Entries: [
				{
					EventBusName,
					Source: 'thingy.ws',
					DetailType: 'message',
					Detail: JSON.stringify(<WebsocketPayload>{
						deviceId,
						connectionId: event.detail.connectionId,
						message,
					}),
				},
			],
		})
	} else {
		const error = BadRequestError({
			id: event.detail.message.request['@id'],
			title: `Configuration update failed`,
			detail: `${res.status}: ${await res.text()}`,
		})
		log.error(`Update failed`, error)
		await eventBus.putEvents({
			Entries: [
				{
					EventBusName,
					Source: 'thingy.ws',
					DetailType: 'error',
					Detail: JSON.stringify(<WebsocketPayload>{
						deviceId: event.detail.deviceId,
						connectionId: event.detail.connectionId,
						message: error,
					}),
				},
			],
		})
	}
}

export const handler = middy(h).use(logMetrics(metrics))
