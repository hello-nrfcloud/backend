import { CloudFormationClient } from '@aws-sdk/client-cloudformation'
import { SSMClient } from '@aws-sdk/client-ssm'
import { runFolder } from '@nordicsemiconductor/bdd-markdown'
import { stackOutput } from '@nordicsemiconductor/cloudformation-helpers'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { StackOutputs as BackendStackOutputs } from '../cdk/stacks/BackendStack.js'
import { STACK_NAME } from '../cdk/stacks/stackConfig.js'
import { getSettings } from '../nrfcloud/settings.js'
import type { WebSocketClient } from './lib/websocket.js'
import { steps as deviceSteps } from './steps/device.js'
import { websocketStepRunners } from './steps/websocket.js'

const ssm = new SSMClient({})

/**
 * This file configures the BDD Feature runner
 * by loading the configuration for the test resources
 * (like AWS services) and providing the required
 * step runners and reporters.
 */

const config = await stackOutput(
	new CloudFormationClient({}),
)<BackendStackOutputs>(STACK_NAME)

const tenantId = randomUUID()
export type World = {
	websocketUri: string
	devicesTable: string
	websocketQueueUri: string
	wsClient?: WebSocketClient
	tenantId: string
}

const accountDeviceSettings = await getSettings({
	ssm,
	stackName: STACK_NAME,
})()

const runner = await runFolder<World>({
	folder: path.join(process.cwd(), 'features'),
	name: 'nRF guide backend',
})

const cleaners: (() => Promise<void>)[] = []

const { steps: webSocketSteps, cleanup: websocketCleanup } =
	websocketStepRunners()
cleaners.push(websocketCleanup)

runner
	.addStepRunners(...webSocketSteps)
	.addStepRunners(...deviceSteps(accountDeviceSettings))

const res = await runner.run({
	websocketUri: config.webSocketURI,
	devicesTable: config.devicesTable,
	websocketQueueUri: config.webSocketQueueURI,
	tenantId,
})

await Promise.all(cleaners.map(async (fn) => fn()))

console.log(JSON.stringify(res, null, 2))

if (!res.ok) process.exit(1)
