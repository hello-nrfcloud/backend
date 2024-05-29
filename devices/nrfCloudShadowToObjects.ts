import type { DeviceShadow } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import {
	LwM2MObjectID,
	type ConnectionInformation_14203,
	type DeviceInformation_14204,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import type { Static } from '@sinclair/typebox'

const max = (timestamps: Array<number>) =>
	timestamps
		.filter(Number.isInteger)
		.reduce((acc, timestamp) => Math.max(acc, timestamp), 0)

export const nrfCloudShadowToObjects = ({
	state: { reported, metadata },
}: Static<typeof DeviceShadow> & {
	state: {
		metadata: Record<string, any>
	}
}): Array<LwM2MObjectInstance> => {
	const objects: Array<LwM2MObjectInstance> = []
	if (reported === undefined) return []

	if ('deviceInfo' in reported.device ?? {}) {
		const timestamps = [
			metadata.reported.device.deviceInfo.imei?.timestamp,
			metadata.reported.device.deviceInfo.modemFirmware?.timestamp,
			metadata.reported.device.deviceInfo.appVersion?.timestamp,
			metadata.reported.device.deviceInfo.board?.timestamp,
		]
		const d = <DeviceInformation_14204>{
			ObjectID: LwM2MObjectID.DeviceInformation_14204,
			ObjectVersion: '1.0',
			Resources: {
				// IMEI
				0: reported.device.deviceInfo.imei,
				// Modem firmware version
				2: reported.device.deviceInfo.modemFirmware,
				// Application firmware version
				3: reported.device.deviceInfo.appVersion ?? '0.0.0-unknown',
				// Board version
				4: reported.device.deviceInfo.board,
			},
		}
		if ('simInfo' in reported.device) {
			// SIM ICCID
			d.Resources[1] = reported.device.simInfo.iccid
			timestamps.push(metadata.reported.device.simInfo.iccid?.timestamp)
		}
		d.Resources[99] = max(timestamps) * 1000
		objects.push(d)
	}

	if ('networkInfo' in reported.device ?? {}) {
		const n: ConnectionInformation_14203 = {
			ObjectID: LwM2MObjectID.ConnectionInformation_14203,
			ObjectVersion: '1.0',
			Resources: {
				// Network mode
				0: reported.device.networkInfo.networkMode,
				// Band
				1: reported.device.networkInfo.currentBand,
				// RSRP (dBm), FIXME: not supported yet: https://github.com/hello-nrfcloud/firmware/issues/105
				2: reported.device.networkInfo.rsrp,
				// Area
				3: reported.device.networkInfo.areaCode,
				// Cell
				4: reported.device.networkInfo.cellID,
				// Mobile country code and mobile network code
				5: parseInt(reported.device.networkInfo.mccmnc, 10),
				// IP address
				6: reported.device.networkInfo.ipAddress,
				// Energy Estimate
				11: reported.device.networkInfo.eest,
				// Timestamp
				99:
					max([
						metadata.reported.device.networkInfo.ipAddress?.timestamp,
						metadata.reported.device.networkInfo.band?.timestamp,
						metadata.reported.device.networkInfo.areaCode?.timestamp,
						metadata.reported.device.networkInfo.cellID?.timestamp,
						metadata.reported.device.networkInfo.mccmnc?.timestamp,
						metadata.reported.device.networkInfo.ipAddress?.timestamp,
					]) * 1000,
			},
		}
		objects.push(n)
	}

	return objects
}
