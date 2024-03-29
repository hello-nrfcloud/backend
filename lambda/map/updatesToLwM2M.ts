import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { models } from '@hello.nrfcloud.com/proto-map'
import { fromEnv } from '@nordicsemiconductor/from-env'
import {
	transformMessageToLwM2M,
	type MessageTransform,
} from '../../lwm2m/transformMessageToLwM2M.js'
import {
	publicDevicesRepo,
	type PublicDevice,
} from '../../map/publicDevicesRepo.js'
import { updateLwM2MShadow } from './updateLwM2MShadow.js'

const { TableName } = fromEnv({
	TableName: 'PUBLIC_DEVICES_TABLE_NAME',
})(process.env)

const updateShadow = updateLwM2MShadow(new IoTDataPlaneClient({}))

const transforms = Object.entries(models).reduce(
	(transforms, [modelID, model]) => ({
		...transforms,
		[modelID]: transformMessageToLwM2M(model.transforms),
	}),
	{},
) as Record<keyof typeof models, MessageTransform>

const devicesRepo = publicDevicesRepo({
	db: new DynamoDBClient({}),
	TableName,
})
const devicesInfoCache = new Map<string, { id: string; model: string } | null>()

/**
 * Store shadow updates in asset_tracker_v2 shadow format as LwM2M objects in a named shadow.
 *
 * TODO: ignore health-check devices
 */
export const handler = async (event: {
	message: Record<string, unknown>
	deviceId: string
}): Promise<void> => {
	console.debug(JSON.stringify({ event }))
	const { deviceId, message } = event

	if (!devicesInfoCache.has(deviceId)) {
		const maybeDevice = await devicesRepo.getByDeviceId(deviceId)
		if ('error' in maybeDevice) {
			console.debug(`[${deviceId}]`, `Error: ${maybeDevice.error}`)
			devicesInfoCache.set(deviceId, null)
		} else {
			devicesInfoCache.set(deviceId, maybeDevice.publicDevice)
		}
	}
	const deviceInfo = devicesInfoCache.get(deviceId) as PublicDevice | null
	if (deviceInfo === null) {
		console.debug(`[${deviceId}]`, 'unknown device')
		return
	}

	const transform = transforms[deviceInfo.model]
	if (transform === undefined) {
		console.debug(`[${deviceId}]`, 'unknown model', deviceInfo.model)
		return
	}

	const objects = await transform(message)

	console.debug(`[${deviceId}]`, deviceInfo.model, objects)

	await updateShadow(deviceInfo.id, objects)
}
