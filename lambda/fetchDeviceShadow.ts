import {
	DynamoDBClient,
	ExecuteStatementCommand,
} from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { proto } from '@bifravst/muninn-proto/Muninn'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { deviceShadow } from './getDeviceShadowFromnRFCloud.js'
import { getModelForDevice } from './getModelForDevice.js'
import { logger } from './logger.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'

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

const {
	EventBusName,
	connectionsTableName,
	nrfCloudEndpoint,
	apiKey,
	DevicesTableName,
} = fromEnv({
	connectionsTableName: 'CONNECTIONS_TABLE_NAME',
	connectionsIndexName: 'CONNECTIONS_INDEX_NAME',
	nrfCloudEndpoint: 'NRF_CLOUD_ENDPOINT',
	apiKey: 'API_KEY',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	EventBusName: 'EVENTBUS_NAME',
})(process.env)

const db = new DynamoDBClient({})
const log = logger('fetchDeviceShadow')
const QUEUE_THRESHOLD = 40 * 1000 // 40 seconds
const eventBus = new EventBridge({})

const fetchDeviceShadow = deviceShadow({
	endpoint: nrfCloudEndpoint,
	apiKey,
	log,
})

const modelFetcher = getModelForDevice({ db, DevicesTableName })

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
	log.info('fetchDeviceShadow event', { event })

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
		const deviceIds = new Set<string>(data.map(({ deviceId }) => deviceId))
		await Promise.all(
			[...deviceIds].map(async (deviceId) => {
				let shadow: any
				try {
					shadow = await fetchDeviceShadow(deviceId)
				} catch (error) {
					log.error(`Failed to fetch shadow for device ${deviceId}`, { error })
					return
				}
				const willUpdateShadow = data.filter(
					(item) =>
						item?.version === undefined || item?.version < shadow.state.version,
				)
				log.info(
					`Devices to be updated shadow data: ${willUpdateShadow.length}`,
				)
				log.debug(`Shadow`, { shadow })
				for (const device of willUpdateShadow) {
					const { model } = await modelFetcher(device.deviceId)
					const converted = await proto({
						onError: (message, model, error) =>
							log.error(
								`Failed to convert message ${JSON.stringify(
									message,
								)} from model ${model}: ${error}`,
							),
					})(model, shadow.state)

					if (converted.length === 0) {
						log.debug('shadow was not converted to any message for device', {
							model,
							device: device.deviceId,
						})
					} else {
						log.info(
							`Sending device shadow of ${device.deviceId}(v.${
								device?.version ?? 0
							}) with shadow data version ${shadow.state.version}`,
						)
					}

					for (const message of converted) {
						log.debug('websocket message', { message })
						await Promise.all([
							eventBus.putEvents({
								Entries: [
									{
										EventBusName,
										Source: 'thingy.ws',
										DetailType: 'message',
										Detail: JSON.stringify(<WebsocketPayload>{
											deviceId: device.deviceId,
											connectionId: device.connectionId,
											message,
										}),
									},
								],
							}),
							updateDeviceVersion(device.connectionId, shadow.state.version),
						])
					}
				}
			}),
		)
	}
}
