import {
	timestampResources,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-map/lwm2m'

export type LwM2MShadow = Record<
	string,
	Record<number, Record<number, string | number | boolean>>
>

export const objectsToShadow = (
	objects: Array<LwM2MObjectInstance>,
): LwM2MShadow =>
	objects
		.sort((u1, u2) => {
			const tsResource1 = timestampResources[u1.ObjectID]
			const tsResource2 = timestampResources[u2.ObjectID]
			const d1 = u1.Resources[tsResource1 as number] as number
			const d2 = u1.Resources[tsResource2 as number] as number
			return d1 - d2 ? 1 : -1
		})
		.reduce<LwM2MShadow>((shadow, update) => {
			const key = `${update.ObjectID}:${update.ObjectVersion ?? '1.0'}`
			return {
				...shadow,
				[key]: {
					[update.ObjectInstanceID ?? 0]: update.Resources as Record<
						number,
						string | number | boolean
					>,
				},
			}
		}, {})
