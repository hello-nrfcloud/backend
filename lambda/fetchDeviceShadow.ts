import {
	DynamoDBClient,
	ExecuteStatementCommand,
} from '@aws-sdk/client-dynamodb'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { deviceShadow } from './getDeviceShadowFromnRFCloud.js'
import { logger } from './logger.js'

type DeviceShadowEvent = {
	Records: {
		body: string
		messageAttributes: {
			createdAt: {
				dataType: string
				stringValue: string
			}
		}
	}[]
}

type EventBody = {
	connectionId: string
	deviceId: string
	version?: number
}

const { queueUrl, connectionsTableName, nrfCloudEndpoint, apiKey } = fromEnv({
	queueUrl: 'QUEUE_URL',
	connectionsTableName: 'CONNECTIONS_TABLE_NAME',
	connectionsIndexName: 'CONNECTIONS_INDEX_NAME',
	nrfCloudEndpoint: 'NRF_CLOUD_ENDPOINT',
	apiKey: 'API_KEY',
})(process.env)

const db = new DynamoDBClient({})
const queue = new SQSClient({})
const log = logger('fetchDeviceShadow')
const QUEUE_THRESHOLD = 40 * 1000 // 40 seconds

const fetchDeviceShadow = deviceShadow({
	endpoint: nrfCloudEndpoint,
	apiKey,
	log,
})

const updateDeviceVersion = async (
	connectionId: string,
	version: number,
): Promise<void> => {
	await db.send(
		new ExecuteStatementCommand({
			Statement: `update "${connectionsTableName}" set "version" = ${version} where "connectionId" = '${connectionId}'`,
		}),
	)
}

export const handler = async (event: DeviceShadowEvent): Promise<void> => {
	log.info('fetchDeviceShadow event')

	for (const record of event.Records) {
		const messageCreatedAt = Number(
			record.messageAttributes?.createdAt?.stringValue,
		)
		if (isNaN(messageCreatedAt)) return

		// 0               60
		// |----------x----|
		// q0       recv   q1
		if (Date.now() - messageCreatedAt > QUEUE_THRESHOLD) {
			log.info(
				`Ignore this message due to it is over the threshold of ${
					QUEUE_THRESHOLD / 1000
				} seconds`,
			)
			return
		}

		const data: EventBody[] = JSON.parse(record.body)
		const devices = new Set<string>()
		data.forEach((device) => {
			devices.add(device.deviceId)
		})
		const shadowData = await fetchDeviceShadow([...devices])
		for (const shadow of shadowData) {
			// Publish only reported state
			const {
				state: { reported },
			} = shadow
			const body = {
				deviceId: shadow.id,
				receivers: [shadow.id],
				payload: { state: { reported } },
			}

			const willUpdateShadow = data.filter(
				(item) =>
					item?.version === undefined || item?.version < shadow.state.version,
			)
			log.info(`Devices to be updated shadow data: ${willUpdateShadow.length}`)
			for (const device of willUpdateShadow) {
				log.info(
					`Sending device shadow of ${device.deviceId}(v.${
						device?.version ?? 0
					}) with shadow data version ${shadow.state.version}`,
				)
				await Promise.all([
					queue.send(
						new SendMessageCommand({
							QueueUrl: queueUrl,
							MessageBody: JSON.stringify({
								senderConnectionId: device.connectionId,
								...body,
							}),
						}),
					),
					updateDeviceVersion(device.connectionId, shadow.state.version),
				])
			}
		}
	}
}
