import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@bifravst/from-env'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import middy from '@middy/core'
import { taskTokenCallbackHandler } from './taskTokenCallbackHandler.js'

const { jobStatusTableName } = fromEnv({
	jobStatusTableName: 'NRF_CLOUD_JOB_STATUS_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})

export const handler = middy()
	.use(requestLogger())
	.handler(
		taskTokenCallbackHandler({
			db,
			jobStatusTableName,
			tokenName: 'waitForFOTAJobCompletionTaskToken',
		}),
	)
