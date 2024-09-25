import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@bifravst/from-env'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import { tryAsJSON } from '@hello.nrfcloud.com/lambda-helpers/tryAsJSON'
import middy from '@middy/core'
import type { EventBridgeEvent } from 'aws-lambda'
import { fail } from '../jobRepo.js'

// This lambda handles failures in the state machine but also the case that the execution is aborted

const { jobTableName } = fromEnv({
	jobTableName: 'JOB_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})
const f = fail(db, jobTableName)

const h = async (
	event: EventBridgeEvent<
		'Step Functions Execution Status Change',
		{
			executionArn: string // e.g. 'arn:aws:states:us-east-2:123456789012:execution:state-machine-name:execution-name'
			stateMachineArn: string // e.g. 'arn:aws:states:us-east-2:123456789012:stateMachine:state-machine'
			name: string // e.g. '01J8NG0JFWM71BH4YPWQV0BQDV'
			status: string // e.g. 'FAILED', 'TIMED_OUT', 'ABORTED'
			startDate: number // e.g. 1551225014968
			stopDate: number // e.g. 1551225017576
			input: string // e.g. '{\"deviceId\":\"oob-350006665978100\",\"upgradePath\":{\">=0.0.0\":\"APP*1e29dfa3*v2.0.1\"},\"reportedVersion\":\"2.0.0\",\"account\":\"nordic\",\"job\":{\"pk\":\"oob-350006665978100#app\"}}'
			inputDetails: null | {
				included: true
			}
			output: null | string // e.g. null or '{}'
			outputDetails: null | {
				included: true
			}
		}
	>,
): Promise<void> => {
	const input = tryAsJSON(event.detail.input) ?? {}
	console.log(`Marking job as failed:`, event.detail.name, event.detail.status)

	await f(
		input.job.pk,
		event.detail.name,
		statusToReason(event.detail.status),
		new Date(event.detail.stopDate),
	)
}
export const handler = middy().use(requestLogger()).handler(h)

const statusToReason = (status: string) => {
	switch (status) {
		case 'FAILED':
			return 'Job execution failed.'
		case 'TIMED_OUT':
			return 'The job timed out.'
		case 'ABORTED':
			return 'The job was cancelled.'
		default:
			return `Unknown reason: ${status}.`
	}
}
