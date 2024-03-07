import {
	DynamoDBClient,
	QueryCommand,
	type QueryCommandInput,
} from '@aws-sdk/client-dynamodb'
import {
	GetThingShadowCommand,
	IoTDataPlaneClient,
	ResourceNotFoundException,
} from '@aws-sdk/client-iot-data-plane'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import {
	formatTypeBoxErrors,
	validateWithTypeBox,
} from '@hello.nrfcloud.com/proto'
import { models } from '@hello.nrfcloud.com/proto-lwm2m'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import { PublicDeviceId } from '@hello.nrfcloud.com/proto/hello/map'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { Type } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { shadowToObjects } from '../../lwm2m/shadowToObjects.js'
import { consentDurationMS } from '../../map/consentDuration.js'
import middy from '@middy/core'
import { corsOPTIONS } from '../util/corsOPTIONS.js'
import { aResponse } from '../util/aResponse.js'
import { aProblem } from '../util/aProblem.js'
import { addVersionHeader } from '../util/addVersionHeader.js'

const {
	publicDevicesTableName,
	publicDevicesTableModelOwnerConfirmedIndex,
	version,
} = fromEnv({
	version: 'VERSION',
	publicDevicesTableName: 'PUBLIC_DEVICES_TABLE_NAME',
	publicDevicesTableModelOwnerConfirmedIndex:
		'PUBLIC_DEVICES_TABLE_MODEL_OWNER_CONFIRMED_INDEX_NAME',
})(process.env)

const db = new DynamoDBClient({})
const iotData = new IoTDataPlaneClient({})
const decoder = new TextDecoder()

const validateInput = validateWithTypeBox(
	Type.Object({
		// Allows to search by the public device id
		ids: Type.Optional(Type.Array(PublicDeviceId)),
	}),
)

const h = async (
	event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
	console.log(JSON.stringify({ event }))

	const devicesToFetch: { id: string; model: string }[] = []
	const minConfirmTime = Date.now() - consentDurationMS

	const qs: Record<string, any> = event.queryStringParameters ?? {}
	if ('ids' in qs) qs.ids = qs.ids?.split(',') ?? []
	const maybeValidQuery = validateInput(qs)

	if ('errors' in maybeValidQuery) {
		return aProblem({
			title: 'Validation failed',
			status: 400,
			detail: formatTypeBoxErrors(maybeValidQuery.errors),
		})
	}

	for (const model of Object.keys(models)) {
		const queryInput: QueryCommandInput = {
			TableName: publicDevicesTableName,
			IndexName: publicDevicesTableModelOwnerConfirmedIndex,
			KeyConditionExpression:
				'#model = :model AND #ownerConfirmed > :minConfirmTime',
			ExpressionAttributeNames: {
				'#id': 'id',
				'#model': 'model',
				'#ownerConfirmed': 'ownerConfirmed',
			},
			ExpressionAttributeValues: {
				':model': { S: model },
				':minConfirmTime': {
					S: new Date(minConfirmTime).toISOString(),
				},
			},
			ProjectionExpression: '#id',
		}

		if (maybeValidQuery.value.ids !== undefined) {
			queryInput.ExpressionAttributeValues = {
				...(queryInput.ExpressionAttributeValues ?? {}),
				':ids': {
					SS: maybeValidQuery.value.ids,
				},
			}
			queryInput.FilterExpression = 'contains(:ids, #id) '
		}

		console.log(JSON.stringify({ queryInput }))

		const { Items } = await db.send(new QueryCommand(queryInput))
		devicesToFetch.push(
			...(Items ?? [])
				.map((item) => unmarshall(item) as { id: string })
				.map(({ id }) => ({ id, model })),
		)
	}

	console.log(JSON.stringify({ devicesToFetch }))

	const devices = (
		await Promise.all(
			devicesToFetch.map(async ({ id: id, model }) => {
				try {
					const shadow = await iotData.send(
						new GetThingShadowCommand({
							thingName: id,
							shadowName: 'lwm2m',
						}),
					)
					return {
						id,
						model,
						state:
							shadow.payload === undefined
								? []
								: shadowToObjects(
										JSON.parse(decoder.decode(shadow.payload)).state.reported,
									),
					}
				} catch (err) {
					if (err instanceof ResourceNotFoundException) {
						console.debug(`[${id}]: no shadow found.`)
					} else {
						console.error(err)
					}
					return { id, model }
				}
			}),
		)
	).filter(({ state }) => state !== undefined)

	console.log(JSON.stringify(devices))

	return aResponse(
		200,
		{
			'@context': Context.map.devices,
			devices: devices.map((device) => ({
				'@context': Context.map.device,
				...device,
			})),
		},
		60 * 10,
	)
}

export const handler = middy()
	.use(addVersionHeader(version))
	.use(corsOPTIONS('POST'))
	.handler(h)
