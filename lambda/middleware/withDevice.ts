import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { HttpStatusCode } from '@hello.nrfcloud.com/proto/hello'
import type { MiddlewareObj } from '@middy/core'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyStructuredResultV2,
} from 'aws-lambda'
import { getDeviceById } from '../../devices/getDeviceById.js'
import type { Device } from '../../devices/device.js'
import { type Context as LambdaContext } from 'aws-lambda'

export const withDevice = ({
	db,
	DevicesTableName,
}: {
	db: DynamoDBClient
	DevicesTableName: string
}): MiddlewareObj<
	APIGatewayProxyEventV2,
	APIGatewayProxyStructuredResultV2,
	Error,
	LambdaContext &
		WithDevice & { validInput: { deviceId: string; fingerprint: string } }
> => {
	const getDevice = getDeviceById({
		db,
		DevicesTableName,
	})
	return {
		before: async (req) => {
			const deviceId = req.context.validInput.deviceId

			const maybeDevice = await getDevice(deviceId)
			if ('error' in maybeDevice) {
				return aProblem({
					title: `No device found with ID!`,
					detail: deviceId,
					status: HttpStatusCode.NOT_FOUND,
				})
			}
			const device = maybeDevice.device
			if (device.fingerprint !== req.context.validInput.fingerprint) {
				return aProblem({
					title: `Fingerprint does not match!`,
					detail: req.context.validInput.fingerprint,
					status: HttpStatusCode.FORBIDDEN,
				})
			}
			req.context.device = maybeDevice.device
			return undefined
		},
	}
}

export type WithDevice = {
	device: Device
}
