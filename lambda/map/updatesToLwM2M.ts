import {
	IoTDataPlaneClient,
	UpdateThingShadowCommand,
} from '@aws-sdk/client-iot-data-plane'
import { transformMessageToLwM2M } from './lwm2m/transformMessageToLwM2M.js'
import {
	models,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-lwm2m'
import { objectsToShadow } from './lwm2m/objectsToShadow.js'

const iotData = new IoTDataPlaneClient({})
const transformUpdate = transformMessageToLwM2M(
	models['PCA20035+solar'].transforms,
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
 */
export const handler = async (event: {
	message: Record<string, unknown>
	deviceId: string
}): Promise<void> => {
	console.debug(JSON.stringify({ event }))
	const { deviceId, message } = event

	// FIXME: check if device is "public"

	const objects = await transformUpdate(message)
	console.log(
		JSON.stringify({
			deviceId,
			objects,
		}),
	)

	await updateShadow(deviceId, objects)
}
