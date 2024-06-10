import type { LwM2MShadow } from '../lwm2m/objectsToShadow.js'

const diffShadows = (
	current: LwM2MShadow,
	update: LwM2MShadow,
): LwM2MShadow | undefined => {
	const diff: LwM2MShadow = {}

	for (const [ObjectIDAndVersion, Instances] of Object.entries(update)) {
		if (current[ObjectIDAndVersion] === undefined) {
			diff[ObjectIDAndVersion] = Instances
			continue
		}
		for (const [InstanceId, Instance] of Object.entries(Instances)) {
			const InstanceIdN = parseInt(InstanceId, 10)
			if (current[ObjectIDAndVersion]![InstanceIdN] === undefined) {
				if (diff[ObjectIDAndVersion] === undefined) {
					diff[ObjectIDAndVersion] = {}
				}
				diff[ObjectIDAndVersion]![InstanceIdN] = Instance
				continue
			}
			for (const [ResourceID, Value] of Object.entries(Instance)) {
				const ResourceIDN = parseInt(ResourceID, 10)
				if (current[ObjectIDAndVersion]![InstanceIdN]![ResourceIDN] !== Value) {
					if (diff[ObjectIDAndVersion] === undefined) {
						diff[ObjectIDAndVersion] = {}
					}
					if (diff[ObjectIDAndVersion]![InstanceIdN] === undefined) {
						diff[ObjectIDAndVersion]![InstanceIdN] = {}
					}
					diff[ObjectIDAndVersion]![InstanceIdN]![ResourceIDN] = Value
				}
			}
		}
	}

	if (Object.entries(diff).length === 0) return undefined

	return diff
}

export const shadowDiff = (
	current: {
		reported?: LwM2MShadow
		desired?: LwM2MShadow
	},
	update: {
		reported?: LwM2MShadow
		desired?: LwM2MShadow
	},
): {
	reported?: LwM2MShadow
	desired?: LwM2MShadow
} => {
	const diff: {
		reported?: LwM2MShadow
		desired?: LwM2MShadow
	} = {}

	const reportedDiff =
		update.reported !== undefined && current.reported !== undefined
			? diffShadows(current.reported, update.reported)
			: undefined
	if (reportedDiff !== undefined) {
		diff.reported = reportedDiff
	}

	const desiredDiff =
		update.desired !== undefined && current.desired !== undefined
			? diffShadows(current.desired, update.desired)
			: undefined
	if (desiredDiff !== undefined) {
		diff.desired = desiredDiff
	}

	return diff
}
