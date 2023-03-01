import {
	DynamoDBClient,
	PutItemCommand,
	QueryCommand,
} from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type {
	APIGatewayProxyStructuredResultV2,
	APIGatewayProxyWebsocketEventV2,
} from 'aws-lambda'
import { logger } from './logger.js'
const { TableName, EventBusName, DevicesTableName } = fromEnv({
	TableName: 'CONNECTIONS_TABLE_NAME',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	EventBusName: 'EVENTBUS_NAME',
})(process.env)

const log = logger('connect')
const db = new DynamoDBClient({})
const eventBus = new EventBridge({})

const publishToWebsocket = async ({
	sender,
	receivers,
	payload,
	meta,
}: {
	sender: string
	receivers: string[]
	payload: Record<string, any>
	meta?: Record<string, any>
}): Promise<void> => {
	await eventBus.putEvents({
		Entries: [
			{
				EventBusName: EventBusName,
				Source: 'thingy.ws',
				DetailType: 'message',
				Detail: JSON.stringify({
					sender,
					receivers,
					payload,
					meta,
				}),
			},
		],
	})
}

export const handler = async (
	event: APIGatewayProxyWebsocketEventV2 & {
		queryStringParameters?: Record<string, any>
	},
): Promise<APIGatewayProxyStructuredResultV2> => {
	log.info('onConnect event', { event })

	// TODO: Validate token against DB
	const code = event.queryStringParameters?.code
	if (code === undefined) {
		log.error(`Code cannot be empty`)
		return {
			statusCode: 401,
		}
	}
	const res = await db.send(
		new QueryCommand({
			TableName: DevicesTableName,
			IndexName: 'secretIndex',
			KeyConditionExpression: 'secret = :secret',
			ExpressionAttributeValues: {
				':secret': {
					S: `${code}`,
				},
			},
		}),
	)

	const device = res.Items?.[0] !== undefined ? unmarshall(res.Items[0]) : null
	if (device === null) {
		log.error(`DeviceId is not found with`, { code })
		return {
			statusCode: 401,
		}
	}

	await eventBus.putEvents({
		Entries: [
			{
				EventBusName: EventBusName,
				Source: 'thingy.ws',
				DetailType: 'connect',
				Detail: JSON.stringify({
					context: {
						deviceId: device.deviceId,
						connectionId: event.requestContext.connectionId,
					},
				}),
			},
		],
	})

	const { secret, ...rest } = device
	await publishToWebsocket({
		sender: device.deviceId,
		receivers: [device.deviceId],
		payload: rest,
	})

	await db.send(
		new PutItemCommand({
			TableName,
			Item: {
				connectionId: {
					S: event.requestContext.connectionId,
				},
				deviceId: {
					S: device.deviceId,
				},
				lastSeen: {
					S: new Date().toISOString(),
				},
				ttl: {
					N: `${Math.round(Date.now() / 1000) + 60 * 60}`,
				},
			},
		}),
	)

	return {
		statusCode: 200,
		body: `Connected. Hello ${event.requestContext.connectionId}@${device.deviceId}!`,
	}
}
