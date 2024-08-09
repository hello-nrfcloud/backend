import {
	GetThingShadowCommand,
	type IoTDataPlaneClient,
} from '@aws-sdk/client-iot-data-plane'
import {
	timestampResources,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import { shadowToObjects } from '@hello.nrfcloud.com/proto-map/lwm2m/aws'
import type { Device } from '../devices/device.js'
import { isUnixTimeInSeconds } from './isUnixTimeInSeconds.js'

export const getLwM2MShadow =
	(iotData: IoTDataPlaneClient) =>
	async (
		device: Pick<Device, 'id' | 'hideDataBefore'>,
	): Promise<
		| {
				shadow: {
					desired: LwM2MObjectInstance[]
					reported: LwM2MObjectInstance[]
				}
		  }
		| { error: Error }
	> => {
		try {
			const { payload } = await iotData.send(
				new GetThingShadowCommand({
					shadowName: 'lwm2m',
					thingName: device.id,
				}),
			)
			if (payload === undefined)
				return {
					shadow: {
						desired: [],
						reported: [],
					},
				}
			const lwm2mShadow = JSON.parse(new TextDecoder('utf-8').decode(payload))
			return {
				shadow: {
					desired: shadowToObjects(lwm2mShadow.state.desired ?? {}).filter(
						hideDataBefore(device),
					),
					reported: shadowToObjects(lwm2mShadow.state.reported ?? {}).filter(
						hideDataBefore(device),
					),
				},
			}
		} catch (error) {
			return { error: error as Error }
		}
	}

const hideDataBefore =
	(device: Pick<Device, 'hideDataBefore'>) => (obj: LwM2MObjectInstance) => {
		if (device.hideDataBefore === undefined) return true
		const tsResource = timestampResources.get(obj.ObjectID)
		if (tsResource === undefined) return true
		const ts = obj.Resources[tsResource]
		if (!isUnixTimeInSeconds(ts)) return true
		return ts > device.hideDataBefore.getTime() / 1000
	}
