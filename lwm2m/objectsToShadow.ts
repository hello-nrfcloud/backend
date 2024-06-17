import {
	instanceTs,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-map/lwm2m'

export type LwM2MShadow = Record<
	string,
	Record<
		number,
		Record<
			number,
			string | number | boolean | Array<string> | Array<number> | Array<boolean>
		>
	>
>

export const objectsToShadow = (
	objects: Array<LwM2MObjectInstance>,
): LwM2MShadow =>
	objects
		.sort((u1, u2) => {
			const d1 = instanceTs(u1)
			const d2 = instanceTs(u2)
			return d1 - d2 ? 1 : -1
		})
		.reduce<LwM2MShadow>((shadow, update) => {
			const key = `${update.ObjectID}:${update.ObjectVersion ?? '1.0'}`
			return {
				...shadow,
				[key]: {
					[update.ObjectInstanceID ?? 0]: update.Resources as Record<
						number,
						| string
						| number
						| boolean
						| Array<string>
						| Array<number>
						| Array<boolean>
					>,
				},
			}
		}, {})
