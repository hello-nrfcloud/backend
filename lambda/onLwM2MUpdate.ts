import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import middy from '@middy/core'
import { requestLogger } from './middleware/requestLogger.js'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { decode } from 'cbor-x'
import {
	fromCBOR,
	senMLtoLwM2M,
	type SenMLType,
} from '@hello.nrfcloud.com/proto-map/senml'
import { updateLwM2MShadow } from '../lwm2m/updateLwM2MShadow.js'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { importLogs } from '../lwm2m/importLogs.js'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { deviceLwM2MObjectUpdate } from './eventbus/deviceLwM2MObjectUpdate.js'

const { EventBusName, importLogsTableName } = fromEnv({
	EventBusName: 'EVENTBUS_NAME',
	importLogsTableName: 'IMPORT_LOGS_TABLE_NAME',
})(process.env)

const eventBus = new EventBridge({})

const notifyWebsocket = deviceLwM2MObjectUpdate(eventBus, EventBusName)

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
	console.debug(
		JSON.stringify({
			event,
		}),
	)
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

	await Promise.all([
		// Mark import as as successful
		logDb.recordSuccess(deviceId, senML, objects),
		// Notify websocket about updates
		...objects.map(async (object) => notifyWebsocket(deviceId, object)),
		// Write update to device shadow
		updateShadow(deviceId, objects).catch((err) => {
			console.error(
				`[${deviceId}]`,
				`Failed to update shadow for ${deviceId}!`,
				err,
			)
		}),
	])
}

export const handler = middy()
	.use(requestLogger())
	.use(logMetrics(metrics))
	.handler(h)
