import {
	IoTDataPlaneClient,
	UpdateThingShadowCommand,
} from '@aws-sdk/client-iot-data-plane'
import { type LwM2MObjectInstance } from '@hello.nrfcloud.com/proto-map'
import { objectsToShadow } from '../../lwm2m/objectsToShadow.js'

export const updateLwM2MShadow =
	(iotData: IoTDataPlaneClient) =>
	async (deviceId: string, objects: LwM2MObjectInstance[]): Promise<void> => {
		await iotData.send(
			new UpdateThingShadowCommand({
				thingName: deviceId,
				shadowName: 'lwm2m',
				payload: JSON.stringify({
					state: {
						reported: objectsToShadow(objects),
					},
				}),
			}),
		)
	}
