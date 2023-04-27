import { CloudFormationClient } from '@aws-sdk/client-cloudformation'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { runFolder } from '@nordicsemiconductor/bdd-markdown'
import { stackOutput } from '@nordicsemiconductor/cloudformation-helpers'
import chalk from 'chalk'
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

const print = (arg: unknown) =>
	typeof arg === 'object' ? JSON.stringify(arg) : arg

const runner = await runFolder<World>({
	folder: path.join(process.cwd(), 'features'),
	name: 'Muninn backend',
	logObserver: {
		onDebug: (info, ...args) =>
			console.error(
				chalk.magenta(info.context.keyword),
				...args.map((arg) => chalk.cyan(print(arg))),
			),
		onError: (info, ...args) =>
			console.error(
				chalk.magenta(info.context.keyword),
				...args.map((arg) => chalk.red(print(arg))),
			),
		onInfo: (info, ...args) =>
			console.error(
				chalk.magenta(info.context.keyword),
				...args.map((arg) => chalk.green(print(arg))),
			),
		onProgress: (info, ...args) =>
			console.error(
				chalk.magenta(info.context.keyword),
				...args.map((arg) => chalk.yellow(print(arg))),
			),
	},
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
	tenantId,
	responsesTableName: testConfig.responsesTableName,
	requestsTableName: testConfig.requestsTableName,
})

await Promise.all(cleaners.map(async (fn) => fn()))

process.stdout.write(JSON.stringify(res, null, 2))

if (!res.ok) {
	console.error(chalk.red('Tests failed'))
	process.exit(1)
}
