import {
	definitions,
	type LwM2MResourceInfo,
	ResourceType,
	isLwM2MObjectID,
} from '@hello.nrfcloud.com/proto-lwm2m'
import {
	TimeUnit,
	TimestreamWriteClient,
	type MeasureValue,
	type _Record,
} from '@aws-sdk/client-timestream-write'
import { logger } from '../util/logger.js'
import { MeasureValueType } from '@aws-sdk/client-timestream-write'
import { storeRecordsInTimestream } from '../../historicalData/storeRecordsInTimestream.js'
import { fromEnv } from '@nordicsemiconductor/from-env'

const { tableInfo } = fromEnv({
	tableInfo: 'HISTORICAL_DATA_TABLE_INFO',
})(process.env)

const [DatabaseName, TableName] = tableInfo.split('|')
if (DatabaseName === undefined || TableName === undefined)
	throw new Error('Historical database is invalid')

const client = new TimestreamWriteClient({})

const log = logger('storeMessagesInTimestream')
const store = storeRecordsInTimestream({
	timestream: client,
	DatabaseName,
	TableName,
	log,
})

export type LwM2MShadow = Record<
	string, // e.g. 14201:1.0 (ObjectID:ObjectVersion)
	Record<
		string, // InstanceID
		Record<
			string, // ResourceID
			number | string | boolean | null
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

			const measures: MeasureValue[] = []

			for (const [ResourceID, Value] of Object.entries(Resources)) {
				const def = definitions[ObjectID].Resources[parseInt(ResourceID, 10)]
				if (def === undefined) {
					console.error(
						`No definition found for ${ObjectID}/${ObjectInstanceID}/${ResourceID}`,
					)
					continue
				}
				if (Value === null) continue

				measures.push({
					Name: `${ObjectID}:${ObjectVersion}/${ResourceID}`,
					Value: Value.toString(),
					Type: toTimestreamType(def),
				})
			}

			Records.push({
				Dimensions: [
					{
						Name: 'ObjectID',
						Value: ObjectID.toString(),
					},
					{
						Name: 'ObjectInstanceID',
						Value: ObjectInstanceID.toString(),
					},
					{
						Name: 'ObjectVersion',
						Value: ObjectVersion,
					},
				],
				MeasureName: `${ObjectID}/${ObjectInstanceID}`,
				MeasureValues: measures,
				MeasureValueType: MeasureValueType.MULTI,
				// Use current timestamp for record, because the device can send the same
				// object multiple times with the same timestamp but different resources
				Time: Date.now().toString(),
				TimeUnit: TimeUnit.MILLISECONDS,
			})
		}
	}

	console.log(JSON.stringify(Records, null, 2))
	await store(Records, {
		Dimensions: [
			{
				Name: 'deviceId',
				Value: event.deviceId,
			},
		],
	})
}

const toTimestreamType = (def: LwM2MResourceInfo) => {
	switch (def.Type) {
		case ResourceType.Boolean:
			return MeasureValueType.BOOLEAN
		case ResourceType.Float:
		case ResourceType.Integer:
			return MeasureValueType.DOUBLE
		case ResourceType.String:
		case ResourceType.Opaque:
		case ResourceType.Time:
			return MeasureValueType.VARCHAR
	}
}
