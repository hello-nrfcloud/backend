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
import { once } from 'lodash-es'
import { slashless } from '../util/slashless.js'
import { getAllAccountsSettings } from '../nrfcloud/allAccounts.js'
import { SSMClient } from '@aws-sdk/client-ssm'
import { loggingFetch } from './loggingFetch.js'
import type { Configuration } from '@hello.nrfcloud.com/proto/hello/model/PCA20035+solar'

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
const ssm = new SSMClient({})
const eventBus = new EventBridge({})

const { track, metrics } = metricsForComponent('configureDevice')

const getAllNRFCloudAPIConfigs: () => Promise<
	Record<
		string,
		{
			apiKey: string
			apiEndpoint: URL
		}
	>
> = once(async () => {
	const allAccountsSettings = await getAllAccountsSettings({
		ssm,
		stackName,
	})()
	return Object.entries(allAccountsSettings).reduce(
		(result, [account, settings]) => {
			if ('nrfCloudSettings' in settings) {
				return {
					...result,
					[account]: {
						apiKey: settings.nrfCloudSettings.apiKey,
						apiEndpoint: new URL(
							settings.nrfCloudSettings.apiEndpoint ??
								'https://api.nrfcloud.com/',
						),
					},
				}
			}

			return result
		},
		{},
	)
})

const trackFetch = loggingFetch({ track, log })

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
	const account = event.detail.nRFCloudAccount
	if (account === undefined)
		throw new Error(`The device does not belong to any nRF Cloud account`)

	const apiConfigs = await getAllNRFCloudAPIConfigs()
	const { apiKey, apiEndpoint } = apiConfigs[account] ?? {}
	if (apiKey === undefined || apiEndpoint === undefined)
		throw new Error(`nRF Cloud API key for ${stackName} is not configured.`)

	const {
		deviceId,
		message: {
			request: {
				configuration: { gnss, updateIntervalSeconds },
			},
		},
	} = event.detail

	const config: Static<typeof Configuration> = {}

	if (gnss !== undefined) {
		config.nod = gnss === false ? ['gnss'] : []
		if (gnss === true) {
			track('gnss:on', MetricUnits.Count, 1)
		} else {
			track('gnss:off', MetricUnits.Count, 1)
		}
	}

	if (updateIntervalSeconds !== undefined) {
		track('updateInterval', MetricUnits.Seconds, updateIntervalSeconds)
		config.activeWaitTime = updateIntervalSeconds
	}

	const res = await trackFetch(
		new URL(
			`${slashless(apiEndpoint)}/v1/devices/${encodeURIComponent(
				deviceId,
			)}/state`,
		),
		{
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				desired: {
					config,
				},
			}),
		},
	)

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
