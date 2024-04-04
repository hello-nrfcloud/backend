import { TimestreamWriteClient } from '@aws-sdk/client-timestream-write'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { EventBridgeEvent } from 'aws-lambda'
import { convertMessageToTimestreamRecords } from '../historicalData/convertMessageToTimestreamRecords.js'
import { storeRecordsInTimestream } from '../historicalData/storeRecordsInTimestream.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'

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

const client = new TimestreamWriteClient({})
const store = storeRecordsInTimestream({
	timestream: client,
	DatabaseName,
	TableName,
	log,
})

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

		await store(convertMessageToTimestreamRecords(message), { Dimensions })
	} catch (error) {
		log.error('Saving error', { error })
		return
	}
}
