import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
	RejectedRecordsException,
	TimestreamWriteClient,
	WriteRecordsCommand,
	type _Record,
} from '@aws-sdk/client-timestream-write'
import { fromEnv } from '@bifravst/from-env'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import {
	LwM2MObjectID,
	isLwM2MObjectID,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import type { LwM2MShadow } from '@hello.nrfcloud.com/proto-map/lwm2m/aws'
import middy from '@middy/core'
import { getDeviceById } from '../devices/getDeviceById.js'
import { instanceMeasuresToRecord } from '../historicalData/instanceMeasuresToRecord.js'
import { NoHistoryMeasuresError } from '../historicalData/NoHistoryMeasuresError.js'

const { tableInfo, DevicesTableName } = fromEnv({
	tableInfo: 'HISTORICAL_DATA_TABLE_INFO',
	DevicesTableName: 'DEVICES_TABLE_NAME',
})(process.env)

const [DatabaseName, TableName] = tableInfo.split('|')
if (DatabaseName === undefined || TableName === undefined)
	throw new Error('Historical database is invalid')

const client = new TimestreamWriteClient({})
const db = new DynamoDBClient()

const { track, metrics } = metricsForComponent('storeObjectsInTimestream')

const deviceModel = new Map<string, string | undefined>()

const getById = getDeviceById({ db, DevicesTableName })

const getDeviceModel = async (
	deviceId: string,
): Promise<string | undefined> => {
	if (!deviceModel.has(deviceId)) {
		const maybeDevice = await getById(deviceId)
		if ('error' in maybeDevice) {
			deviceModel.set(deviceId, undefined)
		} else {
			deviceModel.set(deviceId, maybeDevice.device.model)
		}
	}
	return deviceModel.get(deviceId)
}

/**
 * Store updates to LwM2M objects in Timestream
 */
const h = async (event: {
	deviceId: string
	reported: LwM2MShadow
}): Promise<void> => {
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

	const model = (await getDeviceModel(event.deviceId)) ?? 'unknown'

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
		track(`success:${model}`, MetricUnit.Count, Records.length)
	} catch (err) {
		console.debug(`Failed to persist records!`, err)
		if (err instanceof RejectedRecordsException) {
			console.debug(`Rejected records`, JSON.stringify(err.RejectedRecords))
			track(
				`error:${model}`,
				MetricUnit.Count,
				err.RejectedRecords?.length ?? 0,
			)
			track(
				`success:${model}`,
				MetricUnit.Count,
				Records.length - (err.RejectedRecords?.length ?? 0),
			)
		} else {
			console.error(err)
			track(`error:${model}`, MetricUnit.Count, 1)
		}
	}
}

export const handler = middy()
	.use(requestLogger())
	.use(logMetrics(metrics))
	.handler(h)
