import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
	formatTypeBoxErrors,
	validateWithTypeBox,
} from '@hello.nrfcloud.com/proto'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import { DeviceId } from '@hello.nrfcloud.com/proto/hello/map'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { Type } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { aProblem } from '../util/aProblem.js'
import { aResponse } from '../util/aResponse.js'
import { corsHeaders } from '../util/corsHeaders.js'
import { publicDevicesRepo } from '../../map/publicDevicesRepo.js'

const { publicDevicesTableName } = fromEnv({
	publicDevicesTableName: 'PUBLIC_DEVICES_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})
const repo = publicDevicesRepo({ db, TableName: publicDevicesTableName })

const validateInput = validateWithTypeBox(
	Type.Object({
		id: DeviceId,
	}),
)

export const handler = async (
	event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
	console.log(JSON.stringify({ event }))

	const cors = corsHeaders(event, ['GET'])
	if (event.requestContext.http.method === 'OPTIONS')
		return {
			statusCode: 200,
			headers: cors,
		}

	const maybeValidQuery = validateInput(event.queryStringParameters)

	if ('errors' in maybeValidQuery) {
		return aProblem(cors, {
			title: 'Validation failed',
			status: 400,
			detail: formatTypeBoxErrors(maybeValidQuery.errors),
		})
	}

	const maybeDevice = await repo.getByDeviceId(maybeValidQuery.value.id)

	console.log(JSON.stringify(maybeDevice))

	if ('error' in maybeDevice) {
		return aProblem(cors, {
			title: `Device ${maybeValidQuery.value.id} not shared: ${maybeDevice.error}`,
			status: 404,
		})
	}

	return aResponse(
		cors,
		200,
		{
			'@context': Context.map.device,
			...maybeDevice.publicDevice,
		},
		60 * 60 * 24,
	)
}
