import {
	MeasureValueType,
	type MeasureValue,
} from '@aws-sdk/client-timestream-write'
import {
	definitions,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import { isNumeric } from '../lwm2m/isNumeric.js'

export const instanceToMeasures = ({
	Resources,
	ObjectID,
	ObjectInstanceID,
	ObjectVersion,
}: LwM2MObjectInstance): { measures: MeasureValue[] } | { error: Error } => {
	const measures: MeasureValue[] = []

	for (const [ResourceID, Value] of Object.entries(Resources)) {
		const def = definitions[ObjectID].Resources[parseInt(ResourceID, 10)]
		if (def === undefined) {
			return {
				error: new Error(
					`[instanceToMeasures] No definition found for ${ObjectID}/${ObjectInstanceID}/${ResourceID}`,
				),
			}
		}

		if (Value === null) continue
		if (Value === undefined) continue

		if (!isNumeric(def)) continue

		measures.push({
			Name: `${ObjectID}/${ObjectVersion}/${ResourceID}`,
			Value: Value.toString(),
			Type: MeasureValueType.DOUBLE,
		})
	}
	return { measures }
}
