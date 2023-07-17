import { CloudFormationClient } from '@aws-sdk/client-cloudformation'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { TimestreamQueryClient } from '@aws-sdk/client-timestream-query'
import { TimestreamWriteClient } from '@aws-sdk/client-timestream-write'
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
import { storeRecordsInTimestream } from '../historicalData/storeRecordsInTimestream.js'
import { getSettings as nrfCloudSettings } from '../nrfcloud/settings.js'
import {
	Scope,
	deleteSettings,
	getSettings,
	putSettings,
} from '../util/settings.js'
import type { WebSocketClient } from './lib/websocket.js'
import { configStepRunners } from './steps/config.js'
import { steps as deviceSteps } from './steps/device.js'
import { steps as historicalDataSteps } from './steps/historicalData.js'
import { steps as mocknRFCloudSteps } from './steps/mocknRFCloud.js'
import { steps as storageSteps } from './steps/storage.js'
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
	devicesTableFingerprintIndexName: string
	historicalDataTableInfo: string
	wsClient?: WebSocketClient
	tenantId: string
	responsesTableName: string
	requestsTableName: string
} & Record<string, string>

const accountDeviceSettings = await nrfCloudSettings({
	ssm,
	stackName: STACK_NAME,
})()
const configWriter = putSettings({
	ssm,
	stackName: STACK_NAME,
	scope: Scope.STACK_CONFIG,
})
const configRemover = deleteSettings({
	ssm,
	stackName: STACK_NAME,
	scope: Scope.STACK_CONFIG,
})
const configSettings = getSettings({
	ssm,
	stackName: STACK_NAME,
	scope: Scope.STACK_CONFIG,
})

const db = new DynamoDBClient({})
const timestream = new TimestreamQueryClient({})
const writeTimestream = new TimestreamWriteClient({})
const [DatabaseName, TableName] = config.historicalDataTableInfo.split('|')
if (DatabaseName === undefined || TableName === undefined)
	throw Error('historicalDataTableInfo is not configured')
const storeTimestream = storeRecordsInTimestream({
	timestream: writeTimestream,
	DatabaseName,
	TableName,
})
const print = (arg: unknown) =>
	typeof arg === 'object' ? JSON.stringify(arg) : arg

const runner = await runFolder<World>({
	folder: path.join(process.cwd(), 'features'),
	name: 'hello.nrfcloud.com backend',
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

const { steps: configSteps, cleanup: configCleanup } = configStepRunners({
	configWriter,
	configRemover,
	configSettings,
})
cleaners.push(configCleanup)

runner
	.addStepRunners(...webSocketSteps)
	.addStepRunners(...deviceSteps(accountDeviceSettings, db))
	.addStepRunners(...mocknRFCloudSteps({ db }))
	.addStepRunners(...historicalDataSteps({ timestream, storeTimestream }))
	.addStepRunners(...storageSteps())
	.addStepRunners(...configSteps)

const res = await runner.run({
	websocketUri: config.webSocketURI,
	devicesTable: config.devicesTableName,
	devicesTableFingerprintIndexName: config.devicesTableFingerprintIndexName,
	tenantId,
	responsesTableName: testConfig.responsesTableName,
	requestsTableName: testConfig.requestsTableName,
	historicalDataTableInfo: config.historicalDataTableInfo,
})

await Promise.all(cleaners.map(async (fn) => fn()))

process.stdout.write(JSON.stringify(res, null, 2))

if (!res.ok) {
	console.error(chalk.red('Tests failed'))
	process.exit(1)
}
