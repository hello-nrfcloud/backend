import { MetricUnits, logMetrics } from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { validateWithJSONSchema } from '@hello.nrfcloud.com/proto'
import {
	BadRequestError,
	HistoricalDataRequest,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { type Static } from '@sinclair/typebox'
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { connectionsRepository } from '../websocket/connectionsRepository.js'
import { metricsForComponent } from './metrics/metrics.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from './util/logger.js'
import type { AuthorizedEvent } from './ws/AuthorizedEvent.js'

const valid = validateWithJSONSchema<Static<typeof HistoricalDataRequest>>(
	HistoricalDataRequest,
)

const { TableName, EventBusName } = fromEnv({
	TableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
	EventBusName: 'EVENTBUS_NAME',
})(process.env)

const log = logger('onMessage')
const db = new DynamoDBClient({})
const eventBus = new EventBridge({})

const repo = connectionsRepository(db, TableName)

const { track, metrics } = metricsForComponent('onMessage')

const h = async (
	event: AuthorizedEvent,
): Promise<APIGatewayProxyStructuredResultV2> => {
	log.info('event', { event })
	await repo.extendTTL(event.requestContext.connectionId)

	const { deviceId, model } = event.requestContext.authorizer
	if (event.body !== undefined) {
		const { payload } = JSON.parse(event.body)
		const maybeRequest = valid(payload)
		if ('errors' in maybeRequest) {
			log.error(`invalid request`, { errors: maybeRequest.errors })
			track('invalidRequest', MetricUnits.Count, 1)

			const err = BadRequestError({
				id: payload?.['@id'],
				title: 'Invalid request',
				detail: JSON.stringify(maybeRequest.errors),
			})
			await eventBus.putEvents({
				Entries: [
					{
						EventBusName,
						Source: 'thingy.ws',
						DetailType: 'error',
						Detail: JSON.stringify(<WebsocketPayload>{
							deviceId,
							connectionId: event.requestContext.connectionId,
							message: err,
						}),
					},
				],
			})

			return { statusCode: 400 }
		}

		if ('value' in maybeRequest) {
			track('historicalRequest', MetricUnits.Count, 1)
			await eventBus.putEvents({
				Entries: [
					{
						EventBusName,
						Source: 'thingy.ws',
						DetailType: 'request',
						Detail: JSON.stringify(<WebsocketPayload>{
							deviceId,
							connectionId: event.requestContext.connectionId,
							message: {
								request: maybeRequest.value,
								model,
							},
						}),
					},
				],
			})
		}
	}

	return {
		statusCode: 200,
	}
}

export const handler = middy(h).use(logMetrics(metrics))
