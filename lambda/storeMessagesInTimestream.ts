import type { Dimension, _Record } from '@aws-sdk/client-timestream-write'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { writeClient } from '@nordicsemiconductor/timestream-helpers'
import type { EventBridgeEvent } from 'aws-lambda'
import { convertMessageToTimestreamRecords } from './historicalData/convertMessageToTimestreamRecords.js'
import { logger } from './logger.js'
import type { WebsocketPayload } from './publishToWebsocketClients'
import { storeRecordsInTimestream } from './storeRecordsInTimestream.js'

type ConvertedMessage = Pick<WebsocketPayload, 'deviceId'> & {
	message: {
		'@context': string
		ts: number
	}
}

const log = logger('storeMessagesInTimestream')

const { tableInfo } = fromEnv({
	tableInfo: 'HISTORICAL_DATA_TABLE_INFO',
})(process.env)

const [DatabaseName, TableName] = tableInfo.split('|')
if (DatabaseName === undefined || TableName === undefined)
	throw new Error('Historical database is invalid')
const store = (async () =>
	storeRecordsInTimestream({
		timestream: await writeClient(),
		DatabaseName,
		TableName,
	}))()

const storeUpdate = async (Records: _Record[], Dimensions: Dimension[]) => {
	log.debug('Saving into timestream', {
		DatabaseName,
		TableName,
		Records,
		Dimensions,
	})
	return (await store)(Records, { Dimensions })
}

/**
 * Processes converted messages and stores the in Timestream
 */
export const handler = async (
	event: EventBridgeEvent<'message', ConvertedMessage>,
): Promise<void> => {
	log.info('event', { event })

	const { deviceId, message } = event.detail
	const Dimensions = [
		{
			Name: 'deviceId',
			Value: deviceId,
		},
	]

	try {
		// Do not store shadow in Timestream
		if ('version' in message) return

		await storeUpdate(convertMessageToTimestreamRecords(message), Dimensions)
	} catch (error) {
		log.error('Saving error', { error })
		return
	}
}
