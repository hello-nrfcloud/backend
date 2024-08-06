import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@bifravst/from-env'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import {
	validateInput,
	type ValidInput,
} from '@hello.nrfcloud.com/lambda-helpers/validateInput'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import { Context, HttpStatusCode } from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { Type } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
	Context as LambdaContext,
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

const InputSchema = Type.Object({
	fingerprint: Type.RegExp(fingerprintRegExp),
})

const h = async (
	event: APIGatewayProxyEventV2,
	context: ValidInput<typeof InputSchema> & LambdaContext,
): Promise<APIGatewayProxyResultV2> => {
	const maybeDevice = await getDevice(context.validInput.fingerprint)
	if ('error' in maybeDevice) {
		return aProblem({
			title: `No device found for fingerprint!`,
			detail: context.validInput.fingerprint,
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
	.use(corsOPTIONS('GET'))
	.use(requestLogger())
	.use(addVersionHeader(version))
	.use(validateInput(InputSchema))
	.handler(h)
