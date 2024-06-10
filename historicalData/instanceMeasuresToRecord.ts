import {
	MeasureValueType,
	TimeUnit,
	type _Record,
} from '@aws-sdk/client-timestream-write'
import {
	timestampResources,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import { instanceToMeasures } from './instanceToMeasures.js'

export class NoHistoryMeasuresError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'NoHistoryMeasuresError'
	}
}

export const instanceMeasuresToRecord = ({
	ObjectID,
	ObjectInstanceID,
	ObjectVersion,
	Resources,
}: LwM2MObjectInstance):
	| { error: Error | NoHistoryMeasuresError }
	| { record: _Record } => {
	const maybeMeasures = instanceToMeasures({
		ObjectID,
		ObjectInstanceID,
		ObjectVersion,
		Resources,
	})
	if ('error' in maybeMeasures) return maybeMeasures
	if (maybeMeasures.measures.length === 0)
		return {
			error: new NoHistoryMeasuresError(
				`No measure to be stored in history for object ${ObjectID}!`,
			),
		}
	const tsResource = Resources[timestampResources.get(ObjectID) as number]
	if (tsResource === undefined)
		return { error: new Error(`No timestamp resource found for ${ObjectID}!`) }
	return {
		record: {
			Dimensions: [
				{
					Name: 'ObjectID',
					Value: ObjectID.toString(),
				},
				{
					Name: 'ObjectInstanceID',
					Value: (ObjectInstanceID ?? 0).toString(),
				},
				{
					Name: 'ObjectVersion',
					Value: ObjectVersion,
				},
			],
			MeasureName: `${ObjectID}/${ObjectInstanceID ?? 0}`,
			MeasureValues: maybeMeasures.measures,
			MeasureValueType: MeasureValueType.MULTI,
			Time: tsResource.toString(),
			TimeUnit: TimeUnit.MILLISECONDS,
		},
	}
}
