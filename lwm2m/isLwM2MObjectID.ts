import { LwM2MObjectID, LwM2MObjectIDs } from '@hello.nrfcloud.com/proto-lwm2m'

export const isLwM2MObjectID = (n: number): n is LwM2MObjectID =>
	LwM2MObjectIDs.includes(n)
