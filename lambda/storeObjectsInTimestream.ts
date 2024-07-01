import {
	RejectedRecordsException,
	TimestreamWriteClient,
	WriteRecordsCommand,
	type _Record,
} from '@aws-sdk/client-timestream-write'
import {
	LwM2MObjectID,
	isLwM2MObjectID,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { instanceMeasuresToRecord } from '../historicalData/instanceMeasuresToRecord.js'
import { NoHistoryMeasuresError } from '../historicalData/NoHistoryMeasuresError.js'
import middy from '@middy/core'
import { requestLogger } from './middleware/requestLogger.js'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { MetricUnit } from '@aws-lambda-powertools/metrics'
import type { LwM2MShadow } from '@hello.nrfcloud.com/proto-map/lwm2m/aws'

const { tableInfo } = fromEnv({
	tableInfo: 'HISTORICAL_DATA_TABLE_INFO',
})(process.env)

const [DatabaseName, TableName] = tableInfo.split('|')
if (DatabaseName === undefined || TableName === undefined)
	throw new Error('Historical database is invalid')

const client = new TimestreamWriteClient({})

const { track, metrics } = metricsForComponent('storeObjectsInTimestream')

/**
 * Store updates to LwM2M objects in Timestream
 */
const h = async (event: {
	deviceId: string
	reported: LwM2MShadow
	model: string
}): Promise<void> => {
	console.debug(JSON.stringify({ event }))

	const Records: _Record[] = []
	for (const [ObjectIDAndVersion, Instances] of Object.entries(
		event.reported,
	)) {
		const [ObjectIDString, ObjectVersion] = ObjectIDAndVersion.split(':')
		const ObjectID = parseInt(ObjectIDString ?? '0', 10)
		if (!isLwM2MObjectID(ObjectID)) continue
		// Do not store GeoLocation objects
		if (ObjectID === LwM2MObjectID.Geolocation_14201) continue
		for (const [InstanceIDString, Resources] of Object.entries(Instances)) {
			const ObjectInstanceID = parseInt(InstanceIDString ?? '0', 10)

			const maybeRecord = instanceMeasuresToRecord({
				ObjectID,
				ObjectInstanceID,
				ObjectVersion,
				Resources,
			})

			if ('error' in maybeRecord) {
				if (maybeRecord.error instanceof NoHistoryMeasuresError) {
					console.debug(`No history measures for ${ObjectID}!`)
				} else {
					console.error(maybeRecord.error)
				}
				continue
			}

			Records.push(maybeRecord.record)
		}
	}

	console.log(JSON.stringify({ Records }))

	if (Records.length === 0) {
		console.debug('No records to store')
		return
	}

	try {
		await client.send(
			new WriteRecordsCommand({
				DatabaseName,
				TableName,
				Records,
				CommonAttributes: {
					Dimensions: [
						{
							Name: 'deviceId',
							Value: event.deviceId,
						},
					],
				},
			}),
		)
		track(`success:${event.model}`, MetricUnit.Count, Records.length)
	} catch (err) {
		console.debug(`Failed to persist records!`, err)
		if (err instanceof RejectedRecordsException) {
			console.debug(`Rejected records`, JSON.stringify(err.RejectedRecords))
			track(
				`error:${event.model}`,
				MetricUnit.Count,
				err.RejectedRecords?.length ?? 0,
			)
			track(
				`success:${event.model}`,
				MetricUnit.Count,
				Records.length - (err.RejectedRecords?.length ?? 0),
			)
		} else {
			console.error(err)
			track(`error:${event.model}`, MetricUnit.Count, 1)
		}
	}
}

export const handler = middy()
	.use(requestLogger())
	.use(logMetrics(metrics))
	.handler(h)
