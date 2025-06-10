import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import middy from '@middy/core'
import {
	getDeviceFirmwareDetails,
	type DeviceFirmwareDetails,
} from '../getDeviceFirmwareDetails.ts'

const iotData = new IoTDataPlaneClient({})

const d = getDeviceFirmwareDetails(iotData)

export const handler = middy<{
	deviceId: string
}>()
	.use(requestLogger())
	.handler(async (event): Promise<DeviceFirmwareDetails> => {
		const maybeFirmwareDetails = await d(event.deviceId, (...args) =>
			console.debug(
				`[FOTA:${event.deviceId}]`,
				...args.map((a) => JSON.stringify(a)),
			),
		)
		if ('error' in maybeFirmwareDetails) throw maybeFirmwareDetails.error
		return maybeFirmwareDetails.details
	})
