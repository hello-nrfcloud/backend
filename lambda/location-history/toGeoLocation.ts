import { type LocationHistory } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import {
	LwM2MObjectID,
	type Geolocation_14201,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-map/lwm2m'

export type LocationHistoryItem = LocationHistory['items'][0]
export const toGeoLocation = (
	item: Pick<
		LocationHistoryItem,
		'lat' | 'lon' | 'serviceType' | 'uncertainty' | 'insertedAt'
	>,
): LwM2MObjectInstance<Geolocation_14201> => {
	// 0: device, 1: ground-fix, 2: single-cell, 9: other
	let ObjectInstanceID = 9
	if (item.serviceType === 'GNSS') ObjectInstanceID = 0
	if (item.serviceType === 'SCELL') ObjectInstanceID = 2
	if (item.serviceType === 'MCELL') ObjectInstanceID = 1
	if (item.serviceType === 'WIFI') ObjectInstanceID = 1
	const l: LwM2MObjectInstance<Geolocation_14201> = {
		ObjectID: LwM2MObjectID.Geolocation_14201,
		ObjectInstanceID,
		ObjectVersion: '1.0',
		Resources: {
			'0': parseFloat(item.lat),
			'1': parseFloat(item.lon),
			'6': item.serviceType,
			'99': new Date(item.insertedAt).getTime(),
			'3': parseFloat(item.uncertainty),
		},
	}
	return l
}
