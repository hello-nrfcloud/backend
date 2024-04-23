import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import {
	formatTypeBoxErrors,
	validateWithTypeBox,
} from '@hello.nrfcloud.com/proto'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	Context,
	HttpStatusCode,
	deviceId,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { Type } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { getDeviceById } from '../devices/getDeviceById.js'
import { importLogs } from '../lwm2m/importLogs.js'

const { importLogsTableName, DevicesTableName, version } = fromEnv({
	importLogsTableName: 'IMPORT_LOGS_TABLE_NAME',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	version: 'VERSION',
})(process.env)

const db = new DynamoDBClient({})

const validateInput = validateWithTypeBox(
	Type.Object({
		id: deviceId,
		fingerprint: Type.Optional(Type.RegExp(fingerprintRegExp)),
	}),
)

const getDevice = getDeviceById({
	db,
	DevicesTableName,
})

const logDb = importLogs(db, importLogsTableName)

const h = async (
	event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
	console.log(JSON.stringify({ event }))

	const maybeValidInput = validateInput({
		...(event.pathParameters ?? {}),
		...(event.queryStringParameters ?? {}),
	})
	if ('errors' in maybeValidInput) {
		return aProblem({
			title: 'Validation failed',
			status: HttpStatusCode.BAD_REQUEST,
			detail: formatTypeBoxErrors(maybeValidInput.errors),
		})
	}

	const maybeDevice = await getDevice(maybeValidInput.value.id)
	if ('error' in maybeDevice) {
		return aProblem({
			title: `No device found with ID!`,
			detail: maybeValidInput.value.id,
			status: HttpStatusCode.NOT_FOUND,
		})
	}
	const device = maybeDevice.device
	if (device.fingerprint !== maybeValidInput.value.fingerprint) {
		return aProblem({
			title: `Fingerprint does not match!`,
			detail: maybeValidInput.value.fingerprint,
			status: HttpStatusCode.FORBIDDEN,
		})
	}

	return aResponse(
		HttpStatusCode.OK,
		{
			'@context': Context.senMLImports,
			id: device.id,
			imports: await logDb.findLogs(device.id),
		},
		60,
	)
}

export const handler = middy()
	.use(addVersionHeader(version))
	.use(corsOPTIONS('GET'))
	.handler(h)
