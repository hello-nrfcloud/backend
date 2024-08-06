import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	BadRequestError,
	HttpStatusCode,
	deviceId,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { fromEnv } from '@bifravst/from-env'
import { Type } from '@sinclair/typebox/type'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
	Context,
} from 'aws-lambda'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import {
	validateInput,
	type ValidInput,
} from '@hello.nrfcloud.com/lambda-helpers/validateInput'
import { withDevice, type WithDevice } from './middleware/withDevice.js'

const { version, tableName } = fromEnv({
	version: 'VERSION',
	tableName: 'DEVICES_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})

const InputSchema = Type.Object({
	deviceId,
	fingerprint: Type.RegExp(fingerprintRegExp),
})

const h = async (
	event: APIGatewayProxyEventV2,
	context: WithDevice & ValidInput<typeof InputSchema> & Context,
): Promise<APIGatewayProxyResultV2> => {
	try {
		await db.send(
			new UpdateItemCommand({
				TableName: tableName,
				Key: {
					deviceId: {
						S: context.device.id,
					},
				},
				UpdateExpression: 'SET #hideDataBefore = :hideDataBefore',
				ExpressionAttributeNames: {
					'#hideDataBefore': 'hideDataBefore',
				},
				ExpressionAttributeValues: {
					':hideDataBefore': { S: new Date().toISOString() },
				},
			}),
		)
		return aResponse(HttpStatusCode.OK)
	} catch (err) {
		return aProblem(
			BadRequestError({
				title: `Update failed`,
				detail: (err as Error).message,
			}),
		)
	}
}

export const handler = middy()
	.use(corsOPTIONS('PATCH'))
	.use(addVersionHeader(version))
	.use(requestLogger())
	.use(validateInput(InputSchema))
	.use(withDevice({ db, DevicesTableName: tableName }))
	.handler(h)
