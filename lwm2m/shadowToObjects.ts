import {
	timestampResources,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import type { LwM2MShadow } from './objectsToShadow.js'

export const shadowToObjects = (shadow: LwM2MShadow): LwM2MObjectInstance[] =>
	Object.entries(shadow)
		.map(([ObjectIdAndVersion, Instances]) => {
			const [ObjectIDString, ObjectVersion] = ObjectIdAndVersion.split(':') as [
				string,
				string,
			]
			const ObjectID = parseInt(ObjectIDString, 10)
			const tsResource = timestampResources.get(ObjectID)
			if (tsResource === undefined) return null
			return Object.entries(Instances).map(([instanceId, Resources]) => {
				const ObjectInstanceID = parseInt(instanceId, 10)
				const objectInstance: LwM2MObjectInstance = {
					ObjectID,
					ObjectVersion,
					Resources,
				}
				if (ObjectInstanceID > 0)
					objectInstance.ObjectInstanceID = ObjectInstanceID
				return objectInstance
			})
		})
		.flat()
		.filter((o) => o !== null)
