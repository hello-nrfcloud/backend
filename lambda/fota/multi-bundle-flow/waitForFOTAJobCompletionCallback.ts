import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@bifravst/from-env'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import middy from '@middy/core'
import { writeTaskToken } from './writeTaskToken.js'

const { jobStatusTableName } = fromEnv({
	jobStatusTableName: 'NRF_CLOUD_JOB_STATUS_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})

export const handler = middy()
	.use(requestLogger())
	.handler(
		async (e: {
			state: {
				fotaJob: {
					/**
					 * @example 'b8c64991-a1e3-4582-8050-51055f7cf7fa'
					 */
					jobId: string
				}
			}
			taskToken: string
		}) =>
			writeTaskToken({
				db,
				TableName: jobStatusTableName,
				tokenName: 'waitForFOTAJobCompletionTaskToken',
			})({
				Key: {
					jobId: {
						S: e.state.fotaJob.jobId,
					},
				},
				taskToken: e.taskToken,
			}),
	)
