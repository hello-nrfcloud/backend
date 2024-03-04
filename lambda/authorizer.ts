import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import {
	DynamoDBClient,
	QueryCommand,
	UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { PolicyDocument } from 'aws-lambda'
import { metricsForComponent } from './metrics/metrics.js'
import { logger } from './util/logger.js'
import type { WebsocketConnectionContext } from './ws/AuthorizedEvent.js'
import { UNSUPPORTED_MODEL } from '../devices/registerUnsupportedDevice.js'

const { DevicesTableName, DevicesIndexName } = fromEnv({
	DevicesTableName: 'DEVICES_TABLE_NAME',
	DevicesIndexName: 'DEVICES_INDEX_NAME',
})(process.env)

const log = logger('connect')
const db = new DynamoDBClient({})

const { track, metrics } = metricsForComponent('websocket')

/**
 * Verifies the fingerprint passed as a query parameter and creates a context for the websocket connect that includes the deviceId and the model.
 */
const h = async (event: {
	methodArn: string
	queryStringParameters: Record<string, string>
	requestContext: {
		connectionId: string
	}
}): Promise<{
	principalId: string
	policyDocument: PolicyDocument
	context?: WebsocketConnectionContext
}> => {
	log.debug('event', { event })

	const deny = {
		principalId: 'me',
		policyDocument: {
			Version: '2012-10-17',
			Statement: [
				{
					Action: 'execute-api:Invoke',
					Effect: 'Deny',
					Resource: event.methodArn,
				},
			],
		},
	}

	const fingerprint = event.queryStringParameters?.fingerprint
	if (fingerprint === undefined) {
		log.error(`Fingerprint cannot be empty`)
		track('authorizer:badRequest', MetricUnit.Count, 1)
		return deny
	}
	const res = await db.send(
		new QueryCommand({
			TableName: DevicesTableName,
			IndexName: DevicesIndexName,
			KeyConditionExpression: '#fingerprint = :fingerprint',
			ExpressionAttributeNames: {
				'#fingerprint': 'fingerprint',
			},
			ExpressionAttributeValues: {
				':fingerprint': {
					S: fingerprint,
				},
			},
		}),
	)

	const device = res.Items?.[0] !== undefined ? unmarshall(res.Items[0]) : null
	if (device === null) {
		log.error(`DeviceId is not found with`, { fingerprint })
		track('authorizer:badFingerprint', MetricUnit.Count, 1)
		return deny
	}

	const { model, deviceId, account } = device

	if (model === undefined || deviceId === undefined) {
		log.error(`Required information is missing`, {
			fingerprint,
			model,
			deviceId,
			account,
		})
		track('authorizer:badInfo', MetricUnit.Count, 1)
		return deny
	}

	if (model !== UNSUPPORTED_MODEL && account === undefined) {
		log.error(`Account is missing`, {
			fingerprint,
			model,
			deviceId,
			account,
		})
		track('authorizer:badInfo', MetricUnit.Count, 1)
		return deny
	}

	// Track usage of fingerprint
	const now = new Date()
	void db.send(
		new UpdateItemCommand({
			TableName: DevicesTableName,
			Key: {
				deviceId: {
					S: deviceId,
				},
			},
			UpdateExpression: 'SET #lastSeen = :now, #day = :day, #source = :source',
			ExpressionAttributeNames: {
				'#lastSeen': 'lastSeen',
				'#day': 'dailyActive__day',
				'#source': 'dailyActive__source',
			},
			ExpressionAttributeValues: {
				':now': {
					S: now.toISOString(),
				},
				':day': {
					S: now.toISOString().slice(0, 10),
				},
				':source': {
					S: 'websocketAuthorizer',
				},
			},
		}),
	)

	log.debug(`Connection request for fingerprint ${fingerprint} authorized.`)
	track('authorizer:success', MetricUnit.Count, 1)

	return {
		principalId: 'me',
		policyDocument: {
			Version: '2012-10-17',
			Statement: [
				{
					Action: 'execute-api:Invoke',
					Effect: 'Allow',
					Resource: event.methodArn,
				},
			],
		},
		context: { model, deviceId, account },
	}
}

export const handler = middy(h).use(logMetrics(metrics))
