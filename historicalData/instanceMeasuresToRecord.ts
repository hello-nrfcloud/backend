import {
	MeasureValueType,
	TimeUnit,
	type _Record,
} from '@aws-sdk/client-timestream-write'
import { type LwM2MObjectInstance } from '@hello.nrfcloud.com/proto-map/lwm2m'
import { instanceToMeasures } from './instanceToMeasures.js'

export const instanceMeasuresToRecord = ({
	ObjectID,
	ObjectInstanceID,
	ObjectVersion,
	Resources,
}: LwM2MObjectInstance): { error: Error } | { record: _Record } => {
	const maybeMeasures = instanceToMeasures({
		ObjectID,
		ObjectInstanceID,
		ObjectVersion,
		Resources,
	})
	if ('error' in maybeMeasures) return maybeMeasures
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
			Time: (Resources[99] as number).toString(),
			TimeUnit: TimeUnit.MILLISECONDS,
		},
	}
}
