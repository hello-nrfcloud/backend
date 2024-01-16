import {
	DynamoDBClient,
	GetItemCommand,
	QueryCommand,
} from '@aws-sdk/client-dynamodb'
import {
	GetThingShadowCommand,
	IoTDataPlaneClient,
	ResourceNotFoundException,
} from '@aws-sdk/client-iot-data-plane'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { aResponse } from '../util/aResponse.js'
import { models } from '@hello.nrfcloud.com/proto-lwm2m'
import { shadowToObjects } from '../../lwm2m/shadowToObjects.js'
import { consentDurationMS } from '../../map/consentDuration.js'
import { validateWithTypeBox } from '../../util/validateWithTypeBox.js'
import { Type } from '@sinclair/typebox'
import { DeviceId } from './typebox.js'

const { publicDevicesTableName, publicDevicesTableModelOwnerConfirmedIndex } =
	fromEnv({
		publicDevicesTableName: 'PUBLIC_DEVICES_TABLE_NAME',
		publicDevicesTableModelOwnerConfirmedIndex:
			'PUBLIC_DEVICES_TABLE_MODEL_OWNER_CONFIRMED_INDEX_NAME',
	})(process.env)

const db = new DynamoDBClient({})
const iotData = new IoTDataPlaneClient({})
const decoder = new TextDecoder()

const validateInput = validateWithTypeBox(
	Type.Object({
		// Allows to search by deviceId (the IoT ThingName)
		deviceId: Type.Optional(DeviceId),
	}),
)

export const handler = async (
	event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
	console.log(JSON.stringify({ event }))

	const devicesToFetch: { id: string; model: string }[] = []
	const minConfirmTime = Date.now() - consentDurationMS

	const q = validateInput(event.queryStringParameters ?? {})
	if ('value' in q && q.value.deviceId !== undefined) {
		const { Item } = await db.send(
			new GetItemCommand({
				TableName: publicDevicesTableName,
				Key: { secret__deviceId: { S: q.value.deviceId } },
				ExpressionAttributeNames: {
					'#id': 'id',
					'#model': 'model',
					'#ownerConfirmed': 'ownerConfirmed',
				},
				ProjectionExpression: '#id,#model,#ownerConfirmed',
			}),
		)
		const { id, model, ownerConfirmed } = unmarshall(Item ?? {}) as {
			id: string
			model: string
			ownerConfirmed?: string // e.g. '2024-01-16T15:49:20.287Z'
		}
		if (
			ownerConfirmed !== undefined &&
			new Date(ownerConfirmed).getTime() > minConfirmTime
		) {
			devicesToFetch.push({ id, model })
		}
	} else {
		for (const model of Object.keys(models)) {
			const { Items } = await db.send(
				new QueryCommand({
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
				}),
			)

			devicesToFetch.push(
				...(Items ?? [])
					.map((item) => unmarshall(item) as { id: string })
					.map(({ id }) => ({ id, model })),
			)
		}
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
						console.debug(`[id]: no shadow found.`)
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
			'@context': new URL(
				`https://github.com/hello-nrfcloud/backend/map/devices`,
			),
			devices,
		},
		{
			'Cache-control': `public, max-age=${60 * 10}`,
		},
	)
}
