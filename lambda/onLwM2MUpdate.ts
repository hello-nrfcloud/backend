import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
import { decode } from 'cbor-x'
import {
	fromCBOR,
	senMLtoLwM2M,
	type SenMLType,
} from '@hello.nrfcloud.com/proto-map/senml'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import type { Static } from '@sinclair/typebox'
import type { Resources as LwM2MResources } from '@hello.nrfcloud.com/proto-map/api'
import { updateLwM2MShadow } from '../lwm2m/updateLwM2MShadow.js'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { importLogs } from '../lwm2m/importLogs.js'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'

const { EventBusName, importLogsTableName } = fromEnv({
	EventBusName: 'EVENTBUS_NAME',
	importLogsTableName: 'IMPORT_LOGS_TABLE_NAME',
})(process.env)

const eventBus = new EventBridge({})

const { track, metrics } = metricsForComponent('deviceMessage')

const iotData = new IoTDataPlaneClient({})
const updateShadow = updateLwM2MShadow(iotData)

const db = new DynamoDBClient({})
const logDb = importLogs(db, importLogsTableName)

const h = async (
	event: {
		deviceId: string
		timestamp: number
	} & (
		| {
				senMLCBOR: string
		  }
		| { senML: SenMLType }
	),
): Promise<void> => {
	console.debug({
		event,
	})
	const { deviceId } = event
	track('deviceMessageLwM2M', MetricUnit.Count, 1)

	let senML: Array<Record<string, unknown>> | undefined = undefined
	if ('senMLCBOR' in event) {
		const senMLCBOR = event.senMLCBOR
		try {
			senML = fromCBOR(decode(Buffer.from(senMLCBOR, 'base64')))
		} catch (err) {
			console.error(`Failed to decode SenML from ${senMLCBOR}!`)
			await logDb.recordError(deviceId, senMLCBOR, [
				`Failed to decode payload as SenML!`,
			])
		}
	} else {
		senML = event.senML
	}
	if (senML === undefined) {
		track('invalidPayload', MetricUnit.Count, 1)
		return
	}

	const maybeObjects = senMLtoLwM2M(senML as any)

	if ('error' in maybeObjects) {
		console.error(`[${deviceId}]`, JSON.stringify(maybeObjects.error.message))
		track('invalidSenML', MetricUnit.Count, 1)
		await logDb.recordError(deviceId, senML, [maybeObjects.error.message])
		return
	}

	const objects = maybeObjects.lwm2m
	console.debug(`[${deviceId}]`, JSON.stringify(maybeObjects))

	if (objects.length === 0) {
		track('unknownDeviceMessageLwM2M', MetricUnit.Count, 1)
		console.debug(`No LwM2M objects found.`)
		await logDb.recordError(deviceId, senML, [`No LwM2M objects found.`])
		return
	}
	track('convertedDeviceMessageLwM2M', MetricUnit.Count, objects.length)

	await logDb.recordSuccess(deviceId, senML, objects)

	await updateShadow(deviceId, objects)

	await Promise.all(
		objects.map(
			async ({ ObjectID, ObjectInstanceID, ObjectVersion, Resources }) => {
				const message = {
					'@context': Context.lwm2mObjectUpdate.toString(),
					ObjectID,
					ObjectInstanceID,
					ObjectVersion,
					Resources: {
						...(Resources as Static<typeof LwM2MResources>),
						[99]: Resources['99'],
					},
				}
				console.debug('websocket message', JSON.stringify({ payload: message }))
				return eventBus.putEvents({
					Entries: [
						{
							EventBusName,
							Source: 'hello.ws',
							DetailType: Context.lwm2mObjectUpdate.toString(),
							Detail: JSON.stringify(<WebsocketPayload>{
								deviceId,
								message,
							}),
						},
					],
				})
			},
		),
	)
}

export const handler = middy(h).use(logMetrics(metrics))