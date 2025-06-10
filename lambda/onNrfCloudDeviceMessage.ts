import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import {
	IoTDataPlaneClient,
	UpdateThingShadowCommand,
} from '@aws-sdk/client-iot-data-plane'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import { objectsToShadow } from '@hello.nrfcloud.com/proto-map/lwm2m/aws'
import middy from '@middy/core'
import { converter } from '../nrfCloud/converter.ts'

const iot = new IoTDataPlaneClient()

const log = logger('onNrfCloudDeviceMessage')

const { track, metrics } = metricsForComponent('onNrfCloudDeviceMessage')

export const handler = middy<
	{
		message: Record<string, any>
		deviceId: string
		timestamp: number
	},
	void
>()
	.use(requestLogger())
	.use(logMetrics(metrics))
	.handler(async (event) => {
		const { message, deviceId } = event

		const converted = converter(message)
		if (converted === null) {
			console.error(`Failed to convert message`, JSON.stringify(message))
			track('deviceMessage:error', MetricUnit.Count, 1)
			return
		}
		track('deviceMessage:success', MetricUnit.Count, 1)

		const reported = objectsToShadow([converted])

		if (Object.keys(reported).length === 0) {
			console.error(`Failed to convert object to shadow!`)
			track('deviceMessage:error', MetricUnit.Count, 1)
			return
		}

		const state = {
			reported,
		}

		log.debug('state', state)

		await iot.send(
			new UpdateThingShadowCommand({
				thingName: deviceId,
				shadowName: 'lwm2m',
				payload: JSON.stringify({
					state,
				}),
			}),
		)
	})
