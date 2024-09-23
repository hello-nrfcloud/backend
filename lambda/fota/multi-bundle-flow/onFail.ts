import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import middy from '@middy/core'
import type { EventBridgeEvent } from 'aws-lambda'

const h = async (
	event: EventBridgeEvent<
		'Step Functions Execution Status Change',
		{
			executionArn: string // e.g. 'arn:aws:states:us-east-2:123456789012:execution:state-machine-name:execution-name'
			stateMachineArn: string // e.g. 'arn:aws:states:us-east-2:123456789012:stateMachine:state-machine'
			name: string // e.g. 'execution-name'
			status: string // e.g. 'ABORTED'
			startDate: number // e.g. 1551225014968
			stopDate: number // e.g. 1551225017576
			input: string // e.g. '{}'
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
	void event
}
export const handler = middy().use(requestLogger()).handler(h)
