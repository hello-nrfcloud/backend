import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { validateWithTypeBox } from '@hello.nrfcloud.com/proto'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import { Context, HttpStatusCode } from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { requestLogger } from './middleware/requestLogger.js'
import { fromEnv } from '@bifravst/from-env'
import { Type } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { getDeviceByFingerprint } from '../devices/getDeviceByFingerprint.js'

const { DevicesTableName, DevicesIndexName, version } = fromEnv({
	version: 'VERSION',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	DevicesIndexName: 'DEVICES_INDEX_NAME',
})(process.env)

const db = new DynamoDBClient({})

const getDevice = getDeviceByFingerprint({
	db,
	DevicesTableName,
	DevicesIndexName,
})

const validateInput = validateWithTypeBox(
	Type.Object({
		fingerprint: Type.RegExp(fingerprintRegExp),
	}),
)

const h = async (
	event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
	const maybeValidInput = validateInput(event.queryStringParameters ?? {})
	if ('errors' in maybeValidInput) {
		return aProblem({
			title: 'Invalid fingerprint provided!',
			detail: event.queryStringParameters?.fingerprint,
			status: HttpStatusCode.BAD_REQUEST,
		})
	}

	const maybeDevice = await getDevice(maybeValidInput.value.fingerprint)
	if ('error' in maybeDevice) {
		return aProblem({
			title: `No device found for fingerprint!`,
			detail: maybeValidInput.value.fingerprint,
			status: HttpStatusCode.NOT_FOUND,
		})
	}
	const device = maybeDevice.device

	return aResponse(
		200,
		{
			'@context': Context.deviceIdentity,
			model: device.model,
			id: device.id,
			hideDataBefore:
				device.hideDataBefore !== undefined
					? device.hideDataBefore.toISOString()
					: undefined,
		},
		60 * 60 * 24,
	)
}

export const handler = middy()
	.use(requestLogger())
	.use(addVersionHeader(version))
	.handler(h)
