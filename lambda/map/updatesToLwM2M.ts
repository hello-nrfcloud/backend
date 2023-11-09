import {
	IoTDataPlaneClient,
	UpdateThingShadowCommand,
} from '@aws-sdk/client-iot-data-plane'
import { transformShadowUpdateToLwM2M } from './lwm2m/transformShadowUpdateToLwM2M.js'
import {
	models,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-lwm2m'
import { objectsToShadow } from './lwm2m/objectsToShadow.js'

const iotData = new IoTDataPlaneClient({})
const transformUpdate = transformShadowUpdateToLwM2M(
	models['asset_tracker_v2+AWS'].transforms,
)

const updateShadow = async (
	deviceId: string,
	objects: LwM2MObjectInstance[],
): Promise<void> => {
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

/**
 * Store shadow updates in asset_tracker_v2 shadow format as LwM2M objects in a named shadow.
 *
 * Also store the updates in a table for historical data.
 */
export const handler = async (event: {
	deviceId: string
	update: {
		state: {
			reported?: Record<string, unknown>
			desired?: Record<string, unknown>
		}
	}
}): Promise<void> => {
	console.debug(JSON.stringify({ event }))
	const { deviceId, update } = event
	const objects = await transformUpdate(update)
	console.log(
		JSON.stringify({
			deviceId,
			objects,
		}),
	)

	void updateShadow(deviceId, objects)
}
