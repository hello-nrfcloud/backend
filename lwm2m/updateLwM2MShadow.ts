import {
	UpdateThingShadowCommand,
	type IoTDataPlaneClient,
} from '@aws-sdk/client-iot-data-plane'
import { type LwM2MObjectInstance } from '@hello.nrfcloud.com/proto-map/lwm2m'
import {
	objectsToShadow,
	type LwM2MShadow,
} from '@hello.nrfcloud.com/proto-map/lwm2m/aws'
import pRetry from 'p-retry'

export const updateLwM2MShadow =
	(iotData: IoTDataPlaneClient) =>
	async (
		deviceId: string,
		reported: LwM2MObjectInstance[],
		desired: LwM2MObjectInstance[] = [],
	): Promise<void> => {
		if (reported.length + desired.length === 0) return
		const state: { reported?: LwM2MShadow; desired?: LwM2MShadow } = {}
		if (reported.length > 0) {
			state.reported = objectsToShadow(reported)
		}
		if (desired.length > 0) {
			state.desired = objectsToShadow(desired)
		}
		await pRetry(
			async () =>
				iotData.send(
					new UpdateThingShadowCommand({
						thingName: deviceId,
						shadowName: 'lwm2m',
						payload: JSON.stringify({
							state,
						}),
					}),
				),
			{
				minTimeout: 250,
				maxTimeout: 500,
				retries: 5,
			},
		)
	}
