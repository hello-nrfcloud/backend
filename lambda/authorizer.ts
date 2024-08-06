import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import middy from '@middy/core'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/middleware/requestLogger'
import { fromEnv } from '@bifravst/from-env'
import type { PolicyDocument } from 'aws-lambda'
import { getDeviceByFingerprint } from '../devices/getDeviceByFingerprint.js'
import { UNSUPPORTED_MODEL } from '../devices/registerUnsupportedDevice.js'
import type { WebsocketConnectionContext } from './ws/AuthorizedEvent.js'
import { validateWithTypeBox } from '@hello.nrfcloud.com/proto'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import { Type } from '@sinclair/typebox'

const { DevicesTableName, DevicesIndexName } = fromEnv({
	DevicesTableName: 'DEVICES_TABLE_NAME',
	DevicesIndexName: 'DEVICES_INDEX_NAME',
})(process.env)

const log = logger('connect')
const db = new DynamoDBClient({})

const { track, metrics } = metricsForComponent('websocket')
const getDevice = getDeviceByFingerprint({
	db,
	DevicesTableName,
	DevicesIndexName,
})

const validateInput = validateWithTypeBox(
	Type.Object({
		fingerprint: Type.RegExp(fingerprintRegExp),
	}),
)

type Result = {
	principalId: string
	policyDocument: PolicyDocument
	context?: WebsocketConnectionContext
}

/**
 * Verifies the fingerprint passed as a query parameter and creates a context for the websocket connect that includes the deviceId and the model.
 */
const h = async (event: {
	methodArn: string
	queryStringParameters: Record<string, string>
	requestContext: {
		connectionId: string
	}
}): Promise<Result> => {
	const deny: Result = {
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

	const maybeValidInput = validateInput(event.queryStringParameters ?? {})
	if ('errors' in maybeValidInput) {
		log.error(`Invalid fingerprint!`)
		track('authorizer:badRequest', MetricUnit.Count, 1)
		return deny
	}

	const fingerprint = maybeValidInput.value.fingerprint
	const maybeDevice = await getDevice(fingerprint)
	if ('error' in maybeDevice) {
		log.error(`DeviceId is not found with`, { fingerprint })
		track('authorizer:badFingerprint', MetricUnit.Count, 1)
		return deny
	}

	const { model, id: deviceId, account, hideDataBefore } = maybeDevice.device

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
		context: {
			model,
			deviceId,
			account,
			hideDataBefore:
				hideDataBefore !== undefined ? hideDataBefore.toISOString() : undefined,
		},
	}
}

export const handler = middy()
	.use(requestLogger())
	.use(logMetrics(metrics))
	.handler(h)
