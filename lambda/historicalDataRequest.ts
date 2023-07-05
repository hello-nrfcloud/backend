import { logMetrics } from '@aws-lambda-powertools/metrics'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { TimestreamQueryClient } from '@aws-sdk/client-timestream-query'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { EventBridgeEvent } from 'aws-lambda'
import {
	historicalDataRepository,
	type HistoricalRequest,
} from '../historicalData/historicalDataRepository.js'
import { metricsForComponent } from './metrics/metrics.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from './util/logger.js'

type Request = Omit<WebsocketPayload, 'message'> & {
	message: {
		model: string
		request: HistoricalRequest
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

const repo = historicalDataRepository({
	timestream,
	historicalDataDatabaseName,
	historicalDataTableName,
	log,
	track,
})

/**
 * Handle historical data request
 */
const h = async (
	event: EventBridgeEvent<'request', Request>,
): Promise<void> => {
	try {
		log.info('event', { event })

		const {
			deviceId,
			connectionId,
			message: { request, model },
		} = event.detail

		const responses = await repo.getHistoricalData({
			deviceId,
			model,
			request,
		})

		for (const response of responses) {
			log.debug('Historical response', { payload: response })
			await eventBus.putEvents({
				Entries: [
					{
						EventBusName,
						Source: 'thingy.ws',
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
	} catch (error) {
		log.error(`Historical request error`, { error })
	}
}

export const handler = middy(h).use(logMetrics(metrics))
