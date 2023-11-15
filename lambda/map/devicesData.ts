import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb'
import {
	GetThingShadowCommand,
	IoTDataPlaneClient,
	ResourceNotFoundException,
} from '@aws-sdk/client-iot-data-plane'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { APIGatewayProxyResultV2 } from 'aws-lambda'
import { aResponse } from '../util/aResponse.js'
import {
	models,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-lwm2m'
import { shadowToObjects } from '../../lwm2m/shadowToObjects.js'
import { consentDurationMS } from '../../map/consentDuration.js'

const { publicDevicesTableName, publicDevicesTableModelOwnerConfirmedIndex } =
	fromEnv({
		publicDevicesTableName: 'PUBLIC_DEVICES_TABLE_NAME',
		publicDevicesTableModelOwnerConfirmedIndex:
			'PUBLIC_DEVICES_TABLE_MODEL_OWNER_CONFIRMED_INDEX_NAME',
	})(process.env)

const db = new DynamoDBClient({})
const iotData = new IoTDataPlaneClient({})
const decoder = new TextDecoder()

export const handler = async (): Promise<APIGatewayProxyResultV2> => {
	const devices: {
		id: string
		model: string
		state?: LwM2MObjectInstance[]
	}[] = []

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
						S: new Date(Date.now() - consentDurationMS).toISOString(),
					},
				},
				ProjectionExpression: '#id',
			}),
		)

		const modelDevicesWithState = (
			await Promise.all(
				(Items ?? [])
					.map((item) => unmarshall(item) as { id: string })
					.map(async ({ id }) => {
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
												JSON.parse(decoder.decode(shadow.payload)).state
													.reported,
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

		console.log(model, `Devices: ${modelDevicesWithState.length}`)

		devices.push(...modelDevicesWithState)
	}

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
