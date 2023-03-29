import { CloudFormationClient } from '@aws-sdk/client-cloudformation'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { runFolder } from '@nordicsemiconductor/bdd-markdown'
import { stackOutput } from '@nordicsemiconductor/cloudformation-helpers'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { StackOutputs as BackendStackOutputs } from '../cdk/stacks/BackendStack.js'
import {
	STACK_NAME,
	TEST_RESOURCES_STACK_NAME,
} from '../cdk/stacks/stackConfig.js'
import type { StackOutputs as TestStackOutputs } from '../cdk/test-resources/TestResourcesStack.js'
import { getSettings } from '../nrfcloud/settings.js'
import type { WebSocketClient } from './lib/websocket.js'
import { steps as deviceSteps } from './steps/device.js'
import { steps as shadowSteps } from './steps/shadow.js'
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

const testConfig = await stackOutput(
	new CloudFormationClient({}),
)<TestStackOutputs>(TEST_RESOURCES_STACK_NAME)

const tenantId = randomUUID()
export type World = {
	websocketUri: string
	devicesTable: string
	websocketQueueUri: string
	wsClient?: WebSocketClient
	tenantId: string
	responsesTableName: string
	requestsTableName: string
}

const accountDeviceSettings = await getSettings({
	ssm,
	stackName: STACK_NAME,
})()
const db = new DynamoDBClient({})

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
	.addStepRunners(...shadowSteps({ db }))

const res = await runner.run({
	websocketUri: config.webSocketURI,
	devicesTable: config.devicesTable,
	websocketQueueUri: config.webSocketQueueURI,
	tenantId,
	responsesTableName: testConfig.responsesTableName,
	requestsTableName: testConfig.requestsTableName,
})

await Promise.all(cleaners.map(async (fn) => fn()))

console.log(JSON.stringify(res, null, 2))

if (!res.ok) process.exit(1)
