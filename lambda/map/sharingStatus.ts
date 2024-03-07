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
import { publicDevicesRepo } from '../../map/publicDevicesRepo.js'
import middy from '@middy/core'
import { corsOPTIONS } from '../util/corsOPTIONS.js'
import { aResponse } from '../util/aResponse.js'
import { aProblem } from '../util/aProblem.js'
import { addVersionHeader } from '../util/addVersionHeader.js'

const { publicDevicesTableName, version } = fromEnv({
	version: 'VERSION',
	publicDevicesTableName: 'PUBLIC_DEVICES_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})
const repo = publicDevicesRepo({ db, TableName: publicDevicesTableName })

const validateInput = validateWithTypeBox(
	Type.Object({
		id: DeviceId,
	}),
)

const h = async (
	event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
	console.log(JSON.stringify({ event }))

	const maybeValidQuery = validateInput(event.queryStringParameters)

	if ('errors' in maybeValidQuery) {
		return aProblem({
			title: 'Validation failed',
			status: 400,
			detail: formatTypeBoxErrors(maybeValidQuery.errors),
		})
	}

	const maybeDevice = await repo.getByDeviceId(maybeValidQuery.value.id)

	console.log(JSON.stringify(maybeDevice))

	if ('error' in maybeDevice) {
		return aProblem({
			title: `Device ${maybeValidQuery.value.id} not shared: ${maybeDevice.error}`,
			status: 404,
		})
	}

	return aResponse(
		200,
		{
			'@context': Context.map.device,
			...maybeDevice.publicDevice,
		},
		60 * 60 * 24,
	)
}

export const handler = middy()
	.use(addVersionHeader(version))
	.use(corsOPTIONS('GET'))
	.handler(h)
