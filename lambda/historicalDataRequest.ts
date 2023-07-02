import { fromEnv } from '@nordicsemiconductor/from-env'
import type { EventBridgeEvent } from 'aws-lambda'
import { logger } from './util/logger.js'

type Request = {
	model: string
	request: Record<string, unknown>
}

const log = logger('historicalDataRequest')

const { tableInfo } = fromEnv({
	tableInfo: 'HISTORICAL_DATA_TABLE_INFO',
})(process.env)

const [DatabaseName, TableName] = tableInfo.split('|')
if (DatabaseName === undefined || TableName === undefined)
	throw new Error('Historical database is invalid')

/**
 * Handle historical data request
 */
export const handler = async (
	event: EventBridgeEvent<'request', Request>,
): Promise<void> => {
	log.info('event', { event })
}
