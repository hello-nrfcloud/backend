/**
 * Handle incoming websocket messages
 */

import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import {
	ConditionalCheckFailedException,
	DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import middy from '@middy/core'
import { requestLogger } from './middleware/requestLogger.js'
import { fromEnv } from '@bifravst/from-env'
import { connectionsRepository } from '../websocket/connectionsRepository.js'
import type { AuthorizedEvent } from './ws/AuthorizedEvent.js'

const { TableName } = fromEnv({
	TableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
})(process.env)

const log = logger('onMessage')
const db = new DynamoDBClient({})

const repo = connectionsRepository(db, TableName)

const { track, metrics } = metricsForComponent('onMessage')

const h = async (event: AuthorizedEvent): Promise<void> => {
	const { connectionId } = event.requestContext

	try {
		await repo.extendTTL(connectionId)
	} catch (error) {
		if (error instanceof ConditionalCheckFailedException) {
			log.debug(`WebConnection is not found`, {
				context: event.requestContext.authorizer,
			})
			track('ConnectionIdMissing', MetricUnit.Count, 1)
		}
	}
}

export const handler = middy()
	.use(requestLogger())
	.use(logMetrics(metrics))
	.use({
		after: async (request) => {
			const { response } = request
			if (response === undefined) request.response = { statusCode: 200 }
		},
	})
	.handler(h)
