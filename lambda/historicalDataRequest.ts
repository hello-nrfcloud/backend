import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { TimestreamQueryClient } from '@aws-sdk/client-timestream-query'
import { InternalError } from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { EventBridgeEvent } from 'aws-lambda'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { createTrailOfCoordinates } from './historical-data/createTrailOfCoordinates.js'
import type { Static } from '@sinclair/typebox'
import type {
	CommonAggregatedRequest,
	CommonRequest,
	CommonResponse,
	LocationRequest,
	LocationTrailRequest,
	LocationTrailResponse,
} from '@hello.nrfcloud.com/proto/hello/history'
import { getHistoricalLocationData } from '../historicalData/locationDataHistory.js'
import { getHistoricalSensorData } from '../historicalData/sensorDataHistory.js'

type Request = Omit<WebsocketPayload, 'message'> & {
	message: {
		model: string
		request: Static<typeof CommonRequest>
	}
}

const { historicalDataTableInfo, EventBusName } = fromEnv({
	historicalDataTableInfo: 'HISTORICAL_DATA_TABLE_INFO',
	EventBusName: 'EVENTBUS_NAME',
})(process.env)

const log = logger('historicalDataRequest')
const timestream = new TimestreamQueryClient({})
const eventBus = new EventBridge({})

const [historicalDataDatabaseName, historicalDataTableName] =
	historicalDataTableInfo.split('|')
if (
	historicalDataDatabaseName === undefined ||
	historicalDataTableName === undefined
) {
	throw new Error(
		`Historical data table info must be in format "databaseName|tableName"`,
	)
}

const { track, metrics } = metricsForComponent('historicalDataRequest')

const locationHistory = getHistoricalLocationData({
	timestream,
	historicalDataDatabaseName,
	historicalDataTableName,
	log,
	track,
})

const sensorHistory = getHistoricalSensorData({
	timestream,
	historicalDataDatabaseName,
	historicalDataTableName,
	log,
	track,
})

const onSuccess =
	({
		eventBus,
		EventBusName,
	}: {
		eventBus: EventBridge
		EventBusName: string
	}) =>
	async ({
		deviceId,
		connectionId,
		response,
	}: {
		deviceId: string
		connectionId?: string
		response: Static<typeof CommonResponse>
	}) => {
		log.debug('Historical response', { payload: response })
		await eventBus.putEvents({
			Entries: [
				{
					EventBusName,
					Source: 'hello.ws',
					DetailType: 'message',
					Detail: JSON.stringify(<WebsocketPayload>{
						deviceId,
						connectionId,
						message: response,
					}),
				},
			],
		})
	}

/**
 * Handle historical data request
 */
const h = async (
	event: EventBridgeEvent<
		'https://github.com/hello-nrfcloud/proto/historical-data-request', // Context.historicalDataRequest.toString()
		Request
	>,
): Promise<void> => {
	const send = onSuccess({
		eventBus,
		EventBusName,
	})
	try {
		log.info('event', { event })

		const {
			deviceId,
			connectionId,
			message: { request, model },
		} = event.detail

		if (request.message === 'locationTrail') {
			// Request the location history, but fold similar locations
			const history = await locationHistory({
				deviceId,
				model,
				request: {
					'@context': request['@context'],
					'@id': request['@id'],
					type: request.type,
					message: 'location',
					attributes: {
						lat: {
							attribute: 'lat',
						},
						lng: {
							attribute: 'lng',
						},
						acc: {
							attribute: 'acc',
						},
						ts: {
							attribute: 'ts',
						},
					},
				},
			})

			const response: Static<typeof LocationTrailResponse> = {
				...history,
				message: 'locationTrail',
				attributes: createTrailOfCoordinates(
					(request as Static<typeof LocationTrailRequest>).minDistanceKm,
					history.attributes,
				),
			}

			await send({
				deviceId: event.detail.deviceId,
				connectionId: event.detail.connectionId,
				response,
			})
		} else if (request.message === 'location') {
			await send({
				deviceId: event.detail.deviceId,
				connectionId,
				response: await locationHistory({
					deviceId,
					model,
					request: request as Static<typeof LocationRequest>,
				}),
			})
		} else {
			await send({
				deviceId: event.detail.deviceId,
				connectionId,
				response: await sensorHistory({
					deviceId,
					model,
					request: request as Static<typeof CommonAggregatedRequest>,
				}),
			})
		}
	} catch (error) {
		log.error(`Historical request error`, { error })
		const err = InternalError({
			id: event.detail.message.request['@id'],
		})
		await eventBus.putEvents({
			Entries: [
				{
					EventBusName,
					Source: 'hello.ws',
					DetailType: 'error',
					Detail: JSON.stringify(<WebsocketPayload>{
						deviceId: event.detail.deviceId,
						connectionId: event.detail.connectionId,
						message: err,
					}),
				},
			],
		})
	}
}

export const handler = middy(h).use(logMetrics(metrics))
