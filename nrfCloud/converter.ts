import {
	LwM2MObjectID,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-map/lwm2m'

const toInstance = (
	ObjectID: LwM2MObjectID,
	Resources: LwM2MObjectInstance['Resources'],
	ObjectInstanceID?: number,
): LwM2MObjectInstance => {
	const i: LwM2MObjectInstance = {
		ObjectID,
		ObjectVersion: '1.0',
		Resources,
	}
	if (ObjectInstanceID !== undefined) i.ObjectInstanceID = ObjectInstanceID
	return i
}

const isAppId = (expectedAppId: string) => (appId: string) =>
	appId === expectedAppId

const converters: Array<
	[
		testFn: (appId: string, data: string | Record<string, any>) => boolean,
		convertFn: (
			data: string | Record<string, any>,
			ts: number,
		) => LwM2MObjectInstance | null,
	]
> = [
	[
		(appId, data) =>
			isAppId('GNSS')(appId) &&
			typeof data === 'object' &&
			'lat' in data &&
			'lng' in data &&
			'acc' in data,
		(data, ts) => {
			const { lat, lng, acc, alt, spd, hdg } = data as Record<string, any>
			return toInstance(LwM2MObjectID.Geolocation_14201, {
				0: lat,
				1: lng,
				3: acc,
				2: alt,
				4: spd,
				5: hdg,
				6: 'GNSS',
				99: Math.floor(ts / 1000),
			})
		},
	],
]

export const converter = (
	message: Record<string, any>,
): LwM2MObjectInstance | null => {
	const { appId, data, ts } = message
	if (appId === undefined) return null
	if (data === undefined) return null
	for (const [testFn, convertFn] of converters) {
		if (!testFn(appId, data)) continue
		const result = convertFn(data, ts)
		if (result !== null) return result
	}
	return null
}
