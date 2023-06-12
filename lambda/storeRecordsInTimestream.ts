import {
	RejectedRecordsException,
	TimestreamWriteClient,
	WriteRecordsCommand,
	type _Record,
} from '@aws-sdk/client-timestream-write'
import { logger } from './logger.js'

const log = logger('storeRecordsInTimestream')

export const storeRecordsInTimestream =
	({
		timestream,
		DatabaseName,
		TableName,
	}: {
		timestream: TimestreamWriteClient
		DatabaseName: string
		TableName: string
	}) =>
	async (Records: _Record[], CommonAttributes?: _Record): Promise<void> => {
		if (Records.length === 0) {
			log.warn('No records to store.')
			return
		}

		const request = timestream.send(
			new WriteRecordsCommand({
				DatabaseName,
				TableName,
				Records,
				CommonAttributes,
			}),
		)
		try {
			await request
		} catch (err) {
			const error = err as Error
			if (error instanceof RejectedRecordsException) {
				log.error('Error writing records [RejectedRecordsException]', {
					RejectedRecords: error.RejectedRecords,
				})
			} else {
				log.error('Error writing records', { error })
			}

			throw error
		}
	}
