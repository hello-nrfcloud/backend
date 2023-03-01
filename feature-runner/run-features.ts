import { CloudFormationClient } from '@aws-sdk/client-cloudformation'
import { runFolder } from '@nordicsemiconductor/bdd-markdown'
import { stackOutput } from '@nordicsemiconductor/cloudformation-helpers'
import * as path from 'path'
import type { StackOutputs as BackendStackOutputs } from '../cdk/stacks/BackendStack.js'
import { STACK_NAME } from '../cdk/stacks/stackConfig.js'
import { steps as websocketSteps } from './steps/websocket-steps.js'

/**
 * This file configures the BDD Feature runner
 * by loading the configuration for the test resources
 * (like AWS services) and providing the required
 * step runners and reporters.
 */

const config = await stackOutput(
	new CloudFormationClient({}),
)<BackendStackOutputs>(STACK_NAME)

export type World = {
	websocketUri: string
	devicesTable: string
}

const runner = await runFolder<World>({
	folder: path.join(process.cwd(), 'features'),
	name: 'nRF guide backend',
})

runner.addStepRunners(...websocketSteps())

const res = await runner.run({
	websocketUri: config.webSocketURI,
	devicesTable: config.devicesTable,
})

console.log(JSON.stringify(res, null, 2))

if (!res.ok) process.exit(1)
