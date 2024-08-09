import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { ProblemDetailError } from '@hello.nrfcloud.com/lambda-helpers/problemResponse'
import { HttpStatusCode } from '@hello.nrfcloud.com/proto/hello'
import type { MiddlewareObj } from '@middy/core'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyStructuredResultV2,
} from 'aws-lambda'
import { type Context as LambdaContext } from 'aws-lambda'
import type { Device } from '../../devices/device.js'
import {
	DeviceNotFoundError,
	getDeviceById,
} from '../../devices/getDeviceById.js'
import { NRF_CLOUD_ACCOUNT } from '../../settings/account.js'

type WithDeviceMiddlewareObject<AuthProps extends Record<string, string>> =
	MiddlewareObj<
		APIGatewayProxyEventV2,
		APIGatewayProxyStructuredResultV2,
		Error,
		LambdaContext &
			WithDevice & {
				validInput: { deviceId: string } & AuthProps
			}
	>

type WithDeviceMiddleware = {
	(args: {
		db: DynamoDBClient
		DevicesTableName: string
	}): WithDeviceMiddlewareObject<{ fingerprint: string }>
	(args: {
		db: DynamoDBClient
		DevicesTableName: string
		validateDeviceJWT: (
			token: string,
		) => Promise<{ device: { deviceId: string } } | { error: Error }>
	}): WithDeviceMiddlewareObject<{ fingerprint?: string; jwt?: string }>
}

export const withDevice: WithDeviceMiddleware = (args) => {
	const { db, DevicesTableName } = args
	const validateDeviceJWT =
		'validateDeviceJWT' in args ? args.validateDeviceJWT : undefined
	const getDevice = getDeviceById({
		db,
		DevicesTableName,
	})
	return {
		before: async (req) => {
			if (
				validateDeviceJWT !== undefined &&
				'jwt' in req.context.validInput &&
				req.context.validInput.jwt !== undefined
			) {
				const maybeValidJWT = await validateDeviceJWT(
					req.context.validInput.jwt,
				)
				if ('error' in maybeValidJWT) {
					console.error(`[withDevice:jwt]`, maybeValidJWT.error)
					throw new ProblemDetailError({
						title: `Failed to validate JWT!`,
						detail: maybeValidJWT.error.message,
						status: HttpStatusCode.BAD_REQUEST,
					})
				}
				if (req.context.validInput.deviceId !== maybeValidJWT.device.deviceId) {
					throw new ProblemDetailError({
						title: `Device JWT does not match!`,
						detail: maybeValidJWT.device.deviceId,
						status: HttpStatusCode.FORBIDDEN,
					})
				}
				// Fetch the device from the database, in case it was a OOB device.
				// A user may have configured `hideDataBefore`...
				const maybeDevice = await getDevice(maybeValidJWT.device.deviceId)
				if ('error' in maybeDevice) {
					if (maybeDevice.error instanceof DeviceNotFoundError) {
						// Device not found
						req.context.device = {
							id: maybeValidJWT.device.deviceId,
							account: NRF_CLOUD_ACCOUNT,
						}
						return undefined
					}
					throw new Error(
						`An unexpected error occured: ${maybeDevice.error.message}!`,
					)
				}
				req.context.device = maybeDevice.device
				return undefined
			}

			const deviceId = req.context.validInput.deviceId

			const maybeDevice = await getDevice(deviceId)
			if ('error' in maybeDevice) {
				throw new ProblemDetailError({
					title: `No device found with ID!`,
					detail: deviceId,
					status: HttpStatusCode.NOT_FOUND,
				})
			}
			const device = maybeDevice.device
			if (device.fingerprint !== req.context.validInput.fingerprint) {
				throw new ProblemDetailError({
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
	device: Pick<Device, 'id' | 'hideDataBefore' | 'account'>
}
