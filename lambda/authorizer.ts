import {
	MetricUnits,
	Metrics,
	logMetrics,
} from '@aws-lambda-powertools/metrics'
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { PolicyDocument } from 'aws-lambda'
import { logger } from './util/logger.js'
import type { WebsocketConnectionContext } from './ws/AuthorizedEvent.js'

const { DevicesTableName, DevicesIndexName } = fromEnv({
	DevicesTableName: 'DEVICES_TABLE_NAME',
	DevicesIndexName: 'DEVICES_INDEX_NAME',
})(process.env)

const log = logger('connect')
const db = new DynamoDBClient({})

const metrics = new Metrics({
	namespace: 'hello-nrfcloud-backend',
	serviceName: 'websocket',
})

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
		metrics.addMetric('authorizer:badRequest', MetricUnits.Count, 1)
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
		metrics.addMetric('authorizer:badFingerprint', MetricUnits.Count, 1)
		return deny
	}

	log.debug(`Connection request for fingerprint ${fingerprint} authorized.`)
	metrics.addMetric('authorizer:success', MetricUnits.Count, 1)

	const { model, deviceId } = device

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
		context: { model, deviceId },
	}
}

export const handler = middy(h).use(logMetrics(metrics))
