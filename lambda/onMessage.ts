import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { connectionsRepository } from '../websocket/connectionsRepository.js'
import { logger } from './util/logger.js'
import type { AuthorizedEvent } from './ws/AuthorizedEvent.js'

const { TableName } = fromEnv({
	TableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
})(process.env)

const log = logger('disconnect')
const db = new DynamoDBClient({})

const repo = connectionsRepository(db, TableName)

export const handler = async (
	event: AuthorizedEvent,
): Promise<APIGatewayProxyStructuredResultV2> => {
	log.info('event', { event })

	await repo.extendTTL(event.requestContext.connectionId)

	return {
		statusCode: 200,
	}
}
