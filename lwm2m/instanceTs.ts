import {
	type LwM2MObjectInstance,
	definitions,
	LwM2MObjectID,
	timestampResources,
} from '@hello.nrfcloud.com/proto-lwm2m'

export const instanceTs = (instance: LwM2MObjectInstance): Date => {
	const definition = definitions[instance.ObjectID as LwM2MObjectID]
	const tsResourceId = timestampResources[definition.ObjectID] as number
	const ts = instance.Resources[tsResourceId] as string
	return new Date(ts)
}

export const newestInstanceFirst = (
	i1: LwM2MObjectInstance,
	i2: LwM2MObjectInstance,
): number => instanceTs(i2).getTime() - instanceTs(i1).getTime()
