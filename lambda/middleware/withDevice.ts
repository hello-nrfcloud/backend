import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { HttpStatusCode } from '@hello.nrfcloud.com/proto/hello'
import type { MiddlewareObj } from '@middy/core'
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { getDeviceById } from '../../devices/getDeviceById.js'
import type { Device } from '../../devices/device.js'

export const withDevice = ({
	db,
	DevicesTableName,
}: {
	db: DynamoDBClient
	DevicesTableName: string
}): MiddlewareObj<
	{
		validInput: {
			deviceId: string
			fingerprint: string
		}
	},
	APIGatewayProxyStructuredResultV2
> => {
	const getDevice = getDeviceById({
		db,
		DevicesTableName,
	})
	return {
		before: async (req) => {
			const deviceId = req.event.validInput.deviceId

			const maybeDevice = await getDevice(deviceId)
			if ('error' in maybeDevice) {
				return aProblem({
					title: `No device found with ID!`,
					detail: deviceId,
					status: HttpStatusCode.NOT_FOUND,
				})
			}
			const device = maybeDevice.device
			if (device.fingerprint !== req.event.validInput.fingerprint) {
				return aProblem({
					title: `Fingerprint does not match!`,
					detail: req.event.validInput.fingerprint,
					status: HttpStatusCode.FORBIDDEN,
				})
			}
			;(req.context as any).device = maybeDevice.device
			return undefined
		},
	}
}

export type WithDevice = {
	device: Device
}
