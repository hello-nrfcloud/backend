import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	Context,
	HttpStatusCode,
	deviceId,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import inputOutputLogger from '@middy/input-output-logger'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { Type } from '@sinclair/typebox'
import type { APIGatewayProxyResultV2 } from 'aws-lambda'
import { getDeviceById } from '../devices/getDeviceById.js'
import { importLogs } from '../lwm2m/importLogs.js'
import { validateInput, type ValidInput } from './middleware/validateInput.js'

const { importLogsTableName, DevicesTableName, version } = fromEnv({
	importLogsTableName: 'IMPORT_LOGS_TABLE_NAME',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	version: 'VERSION',
})(process.env)

const db = new DynamoDBClient({})

const InputSchema = Type.Object({
	id: deviceId,
	fingerprint: Type.RegExp(fingerprintRegExp),
})

const getDevice = getDeviceById({
	db,
	DevicesTableName,
})

const logDb = importLogs(db, importLogsTableName)

const h = async (
	event: ValidInput<typeof InputSchema>,
): Promise<APIGatewayProxyResultV2> => {
	console.log(JSON.stringify({ event }))

	const maybeDevice = await getDevice(event.validInput.id)
	if ('error' in maybeDevice) {
		return aProblem({
			title: `No device found with ID!`,
			detail: event.validInput.id,
			status: HttpStatusCode.NOT_FOUND,
		})
	}
	const device = maybeDevice.device
	if (device.fingerprint !== event.validInput.fingerprint) {
		return aProblem({
			title: `Fingerprint does not match!`,
			detail: event.validInput.fingerprint,
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
	.use(inputOutputLogger())
	.use(addVersionHeader(version))
	.use(corsOPTIONS('GET'))
	.use(validateInput(InputSchema))
	.handler(h)
