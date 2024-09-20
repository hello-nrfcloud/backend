import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@bifravst/from-env'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import middy from '@middy/core'
import { writeTaskToken } from './writeTaskToken.js'

const { jobTableName } = fromEnv({
	jobTableName: 'JOB_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})

export const handler = middy()
	.use(requestLogger())
	.handler(
		async (e: {
			state: {
				job: {
					/**
					 * @example "oob-350006667318123#app"
					 */
					pk: string
				}
			}
			taskToken: string
		}) =>
			writeTaskToken({
				db,
				TableName: jobTableName,
				tokenName: 'waitForUpdateAppliedTaskToken',
			})({
				Key: {
					pk: {
						S: e.state.job.pk,
					},
				},
				taskToken: e.taskToken,
			}),
	)
