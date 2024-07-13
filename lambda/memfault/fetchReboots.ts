import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { BatchWriteItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { SSMClient } from '@aws-sdk/client-ssm'
import { marshall } from '@aws-sdk/util-dynamodb'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import middy from '@middy/core'
import { requestLogger } from '../middleware/requestLogger.js'
import { fromEnv } from '@bifravst/from-env'
import type { SQSEvent } from 'aws-lambda'
import { getDeviceReboots } from '../../Memfault/api.js'
import { updateLwM2MShadow } from '../../lwm2m/updateLwM2MShadow.js'
import { getMemfaultSettings } from '../../settings/memfault.js'
import { deviceLwM2MObjectUpdate } from '../eventbus/deviceLwM2MObjectUpdate.js'
import { loggingFetch } from '../loggingFetch.js'
import { toReboot } from './toReboot.js'

const { stackName, tableName, EventBusName } = fromEnv({
	stackName: 'STACK_NAME',
	tableName: 'TABLE_NAME',
	EventBusName: 'EVENTBUS_NAME',
})(process.env)

const eventBus = new EventBridge({})
const iotData = new IoTDataPlaneClient({})
const db = new DynamoDBClient({})
const ssm = new SSMClient({})

const notifyWebsocket = deviceLwM2MObjectUpdate(eventBus, EventBusName)

const { track, metrics } = metricsForComponent('fetchMemfaultReboots')

const { organizationAuthToken, organizationSlug, projectSlug, apiEndpoint } =
	await getMemfaultSettings({
		ssm,
		stackName,
	})

const log = logger('fetchMemfaultReboots')
const fetchReboots = getDeviceReboots(
	{
		organizationAuthToken,
		organizationSlug,
		projectSlug,
		apiEndpoint,
	},
	loggingFetch({ track, log }),
)

const updateShadow = updateLwM2MShadow(iotData)

const h = async (event: SQSEvent): Promise<void> => {
	for (const record of event.Records) {
		const { deviceId, since } = JSON.parse(record.body) as Record<
			string,
			string
		>

		if (deviceId === undefined || since === undefined) {
			log.error('Missing required attributes')
			track('error', MetricUnit.Count, 1)
			continue
		}
		const maybeReboots = await fetchReboots(deviceId, since)
		if ('error' in maybeReboots) {
			log.error(maybeReboots.error.message)
			track('error', MetricUnit.Count, 1)
			continue
		}
		const reboots = maybeReboots.value.data
		track('numReboots', MetricUnit.Count, reboots.length)
		log.debug('reboots', JSON.stringify(reboots))

		// Update the shadow with the latest
		if (reboots[0]) await updateShadow(deviceId, [toReboot(reboots[0])])

		// And put all in the table
		const records = reboots.map((reboot) => ({
			PutRequest: {
				Item: marshall(
					{
						deviceId,
						timestamp: reboot.time,
						reason: reboot.reason,
						ttl: Math.round(Date.now() / 1000) + 60 * 60 * 24 * 30,
					},
					{ removeUndefinedValues: true },
				),
			},
		}))
		if (records.length > 0)
			await db.send(
				new BatchWriteItemCommand({
					RequestItems: {
						[tableName]: records,
					},
				}),
			)

		// Put updates on the event bus
		await Promise.all(
			reboots.map(async (reboot) =>
				notifyWebsocket(deviceId, toReboot(reboot)),
			),
		)
	}
}

export const handler = middy()
	.use(requestLogger())
	.use(logMetrics(metrics))
	.handler(h)
