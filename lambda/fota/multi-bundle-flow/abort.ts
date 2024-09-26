import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
	DescribeExecutionCommand,
	ExecutionStatus,
	SFNClient,
	StopExecutionCommand,
} from '@aws-sdk/client-sfn'
import { fromEnv } from '@bifravst/from-env'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import {
	ProblemDetailError,
	problemResponse,
} from '@hello.nrfcloud.com/lambda-helpers/problemResponse'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import { tryAsJSON } from '@hello.nrfcloud.com/lambda-helpers/tryAsJSON'
import {
	validateInput,
	type ValidInput,
} from '@hello.nrfcloud.com/lambda-helpers/validateInput'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import { deviceId, HttpStatusCode } from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { Type } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { ulidRegEx } from '../../../util/ulid.js'
import { withDevice, type WithDevice } from '../../middleware/withDevice.js'

const { version, DevicesTableName, StateMachineArn } = fromEnv({
	version: 'VERSION',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	stackName: 'STACK_NAME',
	StateMachineArn: 'STATE_MACHINE_ARN',
})(process.env)

const db = new DynamoDBClient({})
const sf = new SFNClient({})

const InputSchema = Type.Object({
	deviceId,
	jobId: Type.RegExp(ulidRegEx, { title: 'Job ID', description: 'ULID' }),
	fingerprint: Type.RegExp(fingerprintRegExp),
})

const h = async (
	event: APIGatewayProxyEventV2,
	context: ValidInput<typeof InputSchema> & WithDevice,
): Promise<APIGatewayProxyResultV2> => {
	const { jobId } = context.validInput

	const executionArn = `${StateMachineArn.replace('stateMachine', 'execution')}:${jobId}`

	const execution = await sf.send(
		new DescribeExecutionCommand({
			executionArn,
		}),
	)

	if (execution.status !== ExecutionStatus.RUNNING) {
		throw new ProblemDetailError({
			status: HttpStatusCode.CONFLICT,
			title: `Execution is not running, but ${execution.status}!`,
		})
	}

	if (tryAsJSON(execution.input)?.deviceId !== context.device.id) {
		throw new ProblemDetailError({
			status: HttpStatusCode.FORBIDDEN,
			title: `Job ${jobId} does not belong to device ${context.device.id}!`,
		})
	}

	await sf.send(
		new StopExecutionCommand({
			executionArn: execution.executionArn,
		}),
	)

	return aResponse(HttpStatusCode.ACCEPTED)
}
export const handler = middy()
	.use(corsOPTIONS('DELETE'))
	.use(addVersionHeader(version))
	.use(requestLogger())
	.use(validateInput(InputSchema))
	.use(withDevice({ db, DevicesTableName }))
	.use(problemResponse())
	.handler(h)
