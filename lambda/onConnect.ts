import {
	DynamoDBClient,
	PutItemCommand,
	QueryCommand,
} from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { Context, DeviceIdentity } from '@nrf-guide/proto/nrfGuide'
import type { Static } from '@sinclair/typebox'
import type {
	APIGatewayProxyStructuredResultV2,
	APIGatewayProxyWebsocketEventV2,
} from 'aws-lambda'
import { logger } from './logger.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'
const { TableName, EventBusName, DevicesTableName, DevicesIndexName } = fromEnv(
	{
		TableName: 'CONNECTIONS_TABLE_NAME',
		DevicesTableName: 'DEVICES_TABLE_NAME',
		DevicesIndexName: 'DEVICES_INDEX_NAME',
		EventBusName: 'EVENTBUS_NAME',
	},
)(process.env)

const log = logger('connect')
const db = new DynamoDBClient({})
const eventBus = new EventBridge({})

export const handler = async (
	event: APIGatewayProxyWebsocketEventV2 & {
		queryStringParameters?: Record<string, any>
	},
): Promise<APIGatewayProxyStructuredResultV2> => {
	log.debug('onConnect event', { event })

	const code = event.queryStringParameters?.code
	if (code === undefined) {
		log.error(`Code cannot be empty`)
		return {
			statusCode: 403, // Forbidden error
		}
	}
	const res = await db.send(
		new QueryCommand({
			TableName: DevicesTableName,
			IndexName: DevicesIndexName,
			KeyConditionExpression: '#code = :code',
			ExpressionAttributeNames: {
				'#code': 'code',
			},
			ExpressionAttributeValues: {
				':code': {
					S: code,
				},
			},
		}),
	)

	const device = res.Items?.[0] !== undefined ? unmarshall(res.Items[0]) : null
	if (device === null) {
		log.error(`DeviceId is not found with`, { code })
		return {
			statusCode: 403, // Forbidden error
		}
	}

	const { code: _, ...rest } = device

	const message: Static<typeof DeviceIdentity> = {
		'@context': Context.deviceIdentity.toString(),
		model: rest.model as string,
		id: device.deviceId as string,
	}

	log.debug('websocket message', { message })
	await eventBus.putEvents({
		Entries: [
			{
				EventBusName,
				Source: 'thingy.ws',
				DetailType: 'connect',
				Detail: JSON.stringify(<WebsocketPayload>{
					deviceId: device.deviceId,
					connectionId: event.requestContext.connectionId,
					message,
				}),
			},
		],
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
