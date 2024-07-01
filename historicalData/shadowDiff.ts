import { timestampResources } from '@hello.nrfcloud.com/proto-map/lwm2m'
import type { LwM2MShadow } from '@hello.nrfcloud.com/proto-map/lwm2m/aws'

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
			if (current[ObjectIDAndVersion]?.[InstanceIdN] === undefined) {
				if (diff[ObjectIDAndVersion] === undefined) {
					diff[ObjectIDAndVersion] = {}
				}
				diff[ObjectIDAndVersion][InstanceIdN] = Instance
				continue
			}
			for (const [ResourceID, Value] of Object.entries(Instance)) {
				const ResourceIDN = parseInt(ResourceID, 10)
				if (current[ObjectIDAndVersion][InstanceIdN][ResourceIDN] !== Value) {
					if (diff[ObjectIDAndVersion] === undefined) {
						diff[ObjectIDAndVersion] = {}
					}
					if (diff[ObjectIDAndVersion][InstanceIdN] === undefined) {
						diff[ObjectIDAndVersion][InstanceIdN] = {}
					}
					diff[ObjectIDAndVersion][InstanceIdN][ResourceIDN] = Value
				}
			}
			// Do not lower the resource timestamp
			const [ObjectID] = ObjectIDAndVersion.split(':')
			if (ObjectID !== undefined) {
				const tsResource = timestampResources.get(parseInt(ObjectID, 10))
				if (tsResource !== undefined) {
					const currentTs =
						current[ObjectIDAndVersion]?.[InstanceIdN]?.[tsResource]
					const diffTs = diff[ObjectIDAndVersion]?.[InstanceIdN]?.[tsResource]
					if (
						currentTs !== undefined &&
						diffTs !== undefined &&
						diffTs < currentTs
					) {
						delete diff[ObjectIDAndVersion]![InstanceIdN]![tsResource]
					}
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
