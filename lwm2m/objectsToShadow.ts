import type { LwM2MObjectInstance } from '@hello.nrfcloud.com/proto-map'

export type LwM2MShadow = Record<
	string,
	Record<number, Record<number, string | number | boolean>>
>

export const objectsToShadow = (
	objects: Array<LwM2MObjectInstance>,
): LwM2MShadow =>
	objects
		.sort((u1, u2) => {
			const d1 = Object.values(u1.Resources).find(
				(r) => r instanceof Date,
			) as Date
			const d2 = Object.values(u2.Resources).find(
				(r) => r instanceof Date,
			) as Date
			return d1.getTime() > d2.getTime() ? 1 : -1
		})
		.reduce<LwM2MShadow>((shadow, update) => {
			const key = `${update.ObjectID}:${update.ObjectVersion ?? '1.0'}`
			return {
				...shadow,
				[key]: {
					[update.ObjectInstanceID ?? 0]: {
						...(shadow[key] ?? {}),
						...Object.entries(update.Resources).reduce((resources, [k, v]) => {
							if (v instanceof Date) return { ...resources, [k]: v.getTime() }
							return {
								...resources,
								[k]: v,
							}
						}, {}),
					},
				},
			}
		}, {})
