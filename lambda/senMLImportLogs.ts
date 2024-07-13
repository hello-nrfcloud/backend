import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
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
import { requestLogger } from './middleware/requestLogger.js'
import { fromEnv } from '@bifravst/from-env'
import { Type } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { importLogs } from '../lwm2m/importLogs.js'
import { validateInput, type ValidInput } from './middleware/validateInput.js'
import { withDevice, type WithDevice } from './middleware/withDevice.js'

const { importLogsTableName, DevicesTableName, version } = fromEnv({
	importLogsTableName: 'IMPORT_LOGS_TABLE_NAME',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	version: 'VERSION',
})(process.env)

const db = new DynamoDBClient({})

const InputSchema = Type.Object({
	deviceId,
	fingerprint: Type.RegExp(fingerprintRegExp),
})

const logDb = importLogs(db, importLogsTableName)

const h = async (
	event: APIGatewayProxyEventV2,
	context: ValidInput<typeof InputSchema> & WithDevice,
): Promise<APIGatewayProxyResultV2> =>
	aResponse(
		HttpStatusCode.OK,
		{
			'@context': Context.senMLImports,
			id: context.device.id,
			imports: await logDb.findLogs(context.device),
		},
		60,
	)

export const handler = middy()
	.use(corsOPTIONS('GET'))
	.use(addVersionHeader(version))
	.use(requestLogger())
	.use(validateInput(InputSchema))
	.use(withDevice({ db, DevicesTableName }))
	.handler(h)
