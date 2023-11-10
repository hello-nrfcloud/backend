import {
	IoTDataPlaneClient,
	UpdateThingShadowCommand,
} from '@aws-sdk/client-iot-data-plane'
import {
	transformMessageToLwM2M,
	type MessageTransformer,
} from '../../lwm2m/transformMessageToLwM2M.js'
import {
	models,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-lwm2m'
import { objectsToShadow } from '../../lwm2m/objectsToShadow.js'
import {
	publicDevicesRepo,
	type PublicDevice,
} from '../../map/publicDevicesRepo.js'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'

const { TableName } = fromEnv({
	TableName: 'DEVICES_TABLE_NAME',
})(process.env)

const iotData = new IoTDataPlaneClient({})

const transformers = Object.entries(models).reduce(
	(transformers, [model, transforms]) => ({
		...transformers,
		[model]: transformMessageToLwM2M(transforms.transforms),
	}),
	{},
) as Record<keyof typeof models, MessageTransformer>

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

const devicesRepo = publicDevicesRepo({ db: new DynamoDBClient({}), TableName })
const devicesInfoCache = new Map<string, { id: string; model: string } | null>()

/**
 * Store shadow updates in asset_tracker_v2 shadow format as LwM2M objects in a named shadow.
 */
export const handler = async (event: {
	message: Record<string, unknown>
	deviceId: string
}): Promise<void> => {
	console.debug(JSON.stringify({ event }))
	const { deviceId, message } = event

	if (!devicesInfoCache.has(deviceId)) {
		devicesInfoCache.set(deviceId, await devicesRepo.getByDeviceId(deviceId))
	}
	const deviceInfo = devicesInfoCache.get(deviceId) as PublicDevice | null
	if (deviceInfo === null) {
		console.debug(`[${deviceId}]`, 'unknown device')
		return
	}

	const transformer = transformers[deviceInfo.model]
	if (transformer === undefined) {
		console.debug(`[${deviceId}]`, 'unknown model', deviceInfo.model)
		return
	}

	const objects = await transformer(message)

	console.debug(`[${deviceId}]`, deviceInfo.model, objects)

	await updateShadow(deviceInfo.id, objects)
}
