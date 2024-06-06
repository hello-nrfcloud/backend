import {
	TimestreamWriteClient,
	WriteRecordsCommand,
	type _Record,
} from '@aws-sdk/client-timestream-write'
import { isLwM2MObjectID } from '@hello.nrfcloud.com/proto-map/lwm2m'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { instanceMeasuresToRecord } from '../historicalData/instanceMeasuresToRecord.js'

const { tableInfo } = fromEnv({
	tableInfo: 'HISTORICAL_DATA_TABLE_INFO',
})(process.env)

const [DatabaseName, TableName] = tableInfo.split('|')
if (DatabaseName === undefined || TableName === undefined)
	throw new Error('Historical database is invalid')

const client = new TimestreamWriteClient({})

export type LwM2MShadow = Record<
	string, // e.g. 14201:1.0 (ObjectID:ObjectVersion)
	Record<
		string, // InstanceID
		Record<
			string, // ResourceID
			number | string | boolean
		>
	>
>

/**
 * Store updates to LwM2M objects in Timestream
 */
export const handler = async (event: {
	deviceId: string
	reported: LwM2MShadow
}): Promise<void> => {
	console.debug(JSON.stringify({ event }))

	const Records: _Record[] = []
	for (const [ObjectIDAndVersion, Instances] of Object.entries(
		event.reported,
	)) {
		const [ObjectIDString, ObjectVersion] = ObjectIDAndVersion.split(':')
		const ObjectID = parseInt(ObjectIDString ?? '0', 10)
		if (!isLwM2MObjectID(ObjectID)) continue
		for (const [InstanceIDString, Resources] of Object.entries(Instances)) {
			const ObjectInstanceID = parseInt(InstanceIDString ?? '0', 10)

			const maybeRecord = instanceMeasuresToRecord({
				ObjectID,
				ObjectInstanceID,
				ObjectVersion,
				Resources,
			})

			if ('error' in maybeRecord) {
				console.error(maybeRecord.error)
				continue
			}

			Records.push(maybeRecord.record)
		}
	}

	console.log(JSON.stringify({ Records }))
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
}
