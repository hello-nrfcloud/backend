import {
	GetThingShadowCommand,
	type IoTDataPlaneClient,
} from '@aws-sdk/client-iot-data-plane'
import { shadowToObjects } from '../lwm2m/shadowToObjects.js'
import type { LwM2MObjectInstance } from '@hello.nrfcloud.com/proto-map/lwm2m'

export const getLwM2MShadow =
	(iotData: IoTDataPlaneClient) =>
	async (
		deviceId: string,
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
					thingName: deviceId,
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
					desired: shadowToObjects(lwm2mShadow.state.desired ?? {}),
					reported: shadowToObjects(lwm2mShadow.state.reported ?? {}),
				},
			}
		} catch (error) {
			return { error: error as Error }
		}
	}
