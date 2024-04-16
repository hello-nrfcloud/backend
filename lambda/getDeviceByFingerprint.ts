import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { validateWithTypeBox } from '@hello.nrfcloud.com/proto'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
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
	console.log(JSON.stringify({ event }))

	const maybeValidInput = validateInput(event.queryStringParameters ?? {})
	if ('errors' in maybeValidInput) {
		return aProblem({
			title: 'Invalid fingerprint provided!',
			detail: event.queryStringParameters?.fingerprint,
			status: 400,
		})
	}

	const device = await getDevice(maybeValidInput.value.fingerprint)
	if (device === null) {
		return aProblem({
			title: `No device found for fingerprint!`,
			detail: maybeValidInput.value.fingerprint,
			status: 404,
		})
	}

	return aResponse(
		200,
		{
			'@context': Context.deviceIdentity,
			model: device.model,
			id: device.id,
		},
		60 * 60 * 24,
	)
}

export const handler = middy().use(addVersionHeader(version)).handler(h)
