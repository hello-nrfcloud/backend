import {
	LwM2MObjectID,
	type LwM2MObjectInstance,
	type Reboot_14250,
} from '@hello.nrfcloud.com/proto-map/lwm2m'

export const toReboot = (item: {
	time: string
	reason?: number
}): LwM2MObjectInstance<Reboot_14250> => {
	const l: LwM2MObjectInstance<Reboot_14250> = {
		ObjectID: LwM2MObjectID.Reboot_14250,
		ObjectInstanceID: 0,
		ObjectVersion: '1.0',
		Resources: {
			'0': item.reason,
			'99': Math.floor(new Date(item.time).getTime() / 1000),
		},
	}
	return l
}
