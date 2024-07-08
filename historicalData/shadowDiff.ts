import { timestampResources } from '@hello.nrfcloud.com/proto-map/lwm2m'
import type { LwM2MShadow } from '@hello.nrfcloud.com/proto-map/lwm2m/aws'
import { isEqual } from 'lodash-es'

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
				const currentValue =
					current[ObjectIDAndVersion][InstanceIdN][ResourceIDN]
				if (!isEqual(currentValue, Value)) {
					if (diff[ObjectIDAndVersion] === undefined) {
						diff[ObjectIDAndVersion] = {}
					}
					if (diff[ObjectIDAndVersion][InstanceIdN] === undefined) {
						diff[ObjectIDAndVersion][InstanceIdN] = {}
					}
					diff[ObjectIDAndVersion][InstanceIdN][ResourceIDN] = Value
				}
			}

			// Do not return diff if only timestamp has changed
			const [ObjectID] = ObjectIDAndVersion.split(':')
			if (ObjectID === undefined) continue
			const tsResource = timestampResources.get(parseInt(ObjectID, 10))
			if (tsResource === undefined) continue

			if (
				diff[ObjectIDAndVersion]?.[InstanceIdN] !== undefined &&
				Object.values(diff[ObjectIDAndVersion][InstanceIdN]).length === 1 &&
				parseInt(
					Object.keys(diff[ObjectIDAndVersion][InstanceIdN])[0] ?? '-1',
					10,
				) === tsResource
			) {
				delete diff[ObjectIDAndVersion][InstanceIdN]
				continue
			}

			// Do not lower the resource timestamp
			const currentTs = current[ObjectIDAndVersion]?.[InstanceIdN]?.[tsResource]
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

	// Remove empty objects
	for (const [k, v] of Object.entries(diff)) {
		if (Object.keys(v).length === 0) {
			delete diff[k]
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
