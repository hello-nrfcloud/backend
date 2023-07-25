/**
 * Handle incoming websocket messages
 */

import { MetricUnits, logMetrics } from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { validateWithTypeBox } from '@hello.nrfcloud.com/proto'
import {
	BadRequestError,
	ConfigureDevice,
	Context,
	HistoricalDataRequest,
	ProblemDetail,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { connectionsRepository } from '../websocket/connectionsRepository.js'
import { metricsForComponent } from './metrics/metrics.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from './util/logger.js'
import type { AuthorizedEvent } from './ws/AuthorizedEvent.js'
import { Type, type Static } from '@sinclair/typebox'
import { toBadRequest } from './ws/toBadRequest.js'
import { validateRequest } from './ws/validateRequest.js'

const validateHistoricalDataRequest = validateWithTypeBox(HistoricalDataRequest)
const validateConfigureDeviceRequest = validateWithTypeBox(ConfigureDevice)

const validRequestContext = validateWithTypeBox(
	Type.Object({
		'@context': Type.Union([
			Type.Literal(Context.historicalDataRequest.toString()),
			Type.Literal(Context.configureDevice.toString()),
		]),
		'@id': Type.Optional(Type.String()),
	}),
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

const error =
	(deviceId: string, event: AuthorizedEvent) =>
	async (problem: Static<typeof ProblemDetail>) => {
		track('invalidRequest', MetricUnits.Count, 1)
		await eventBus.putEvents({
			Entries: [
				{
					EventBusName,
					Source: 'thingy.ws',
					DetailType: 'error',
					Detail: JSON.stringify(<WebsocketPayload>{
						deviceId,
						connectionId: event.requestContext.connectionId,
						message: problem,
					}),
				},
			],
		})
	}

const success =
	(deviceId: string, model: string, event: AuthorizedEvent) =>
	async (request: { '@context': string; [key: string]: any }) => {
		await eventBus.putEvents({
			Entries: [
				{
					EventBusName,
					Source: 'thingy.ws',
					DetailType: request['@context'],
					Detail: JSON.stringify(<WebsocketPayload>{
						deviceId,
						connectionId: event.requestContext.connectionId,
						message: {
							request,
							model,
						},
					}),
				},
			],
		})
	}

const h = async (event: AuthorizedEvent): Promise<void> => {
	log.info('event', { event })
	await repo.extendTTL(event.requestContext.connectionId)

	const { deviceId, model } = event.requestContext.authorizer
	const onError = error(deviceId, event)
	const onSuccess = success(deviceId, model, event)

	// Handle blank messages
	if (event.body === undefined) {
		console.debug(`Empty message received.`)
		await onError(
			BadRequestError({
				title: `Empty message received.`,
			}),
		)
		return
	}

	// Handle broken JSON
	let payload: Record<string, any>
	try {
		payload = JSON.parse(event.body).payload
	} catch (err) {
		await onError(
			BadRequestError({
				title: `Failed to parse messages as JSON.`,
				detail: JSON.stringify(err),
			}),
		)
		return
	}

	// Extract the @context property of the request
	const maybeValidRequestContext = validRequestContext(payload)
	if ('errors' in maybeValidRequestContext) {
		log.error(`invalid request`, maybeValidRequestContext)
		await onError(toBadRequest(payload, maybeValidRequestContext.errors))
		return
	}
	const context = maybeValidRequestContext.value['@context']

	// Validate the request based on the context
	let maybeValidRequest:
		| {
				problem: Static<typeof ProblemDetail>
		  }
		| {
				request:
					| Static<typeof HistoricalDataRequest>
					| Static<typeof ConfigureDevice>
		  }

	switch (context) {
		case Context.historicalDataRequest.toString():
			maybeValidRequest = validateRequest<typeof HistoricalDataRequest>(
				payload,
				validateHistoricalDataRequest,
			)
			if ('request' in maybeValidRequest)
				track('historicalRequest', MetricUnits.Count, 1)
			break
		case Context.configureDevice.toString():
			maybeValidRequest = validateRequest<typeof ConfigureDevice>(
				payload,
				validateConfigureDeviceRequest,
			)
			if ('request' in maybeValidRequest)
				track('configureDevice', MetricUnits.Count, 1)
			break
		default:
			log.error(`Unexpected request`, maybeValidRequestContext)
			await onError(
				BadRequestError({
					id: payload?.['@id'],
					title: 'Unexpected request',
					detail: context,
				}),
			)
			return
	}

	// The request itself was not valid
	if ('problem' in maybeValidRequest) {
		log.error(`Invalid request`, maybeValidRequest)
		await onError(maybeValidRequest.problem)
		return
	}

	// We have a valid request, publish it on EventBridge
	log.debug('request', maybeValidRequest)
	await onSuccess(maybeValidRequest.request)
}

export const handler = middy(h).use(logMetrics(metrics))
