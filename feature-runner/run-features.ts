import { CloudFormationClient } from '@aws-sdk/client-cloudformation'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { TimestreamQueryClient } from '@aws-sdk/client-timestream-query'
import { TimestreamWriteClient } from '@aws-sdk/client-timestream-write'
import { runFolder } from '@nordicsemiconductor/bdd-markdown'
import { stackOutput } from '@nordicsemiconductor/cloudformation-helpers'
import chalk from 'chalk'
import path from 'node:path'
import type { StackOutputs as BackendStackOutputs } from '../cdk/stacks/BackendStack.js'
import type { StackOutputs as MapBackendStackOutputs } from '../cdk/stacks/MapBackendStack.js'
import {
	MAP_BACKEND_STACK_NAME,
	STACK_NAME,
	TEST_RESOURCES_STACK_NAME,
} from '../cdk/stacks/stackConfig.js'
import type { StackOutputs as TestStackOutputs } from '../cdk/test-resources/TestResourcesStack.js'
import { storeRecordsInTimestream } from '../historicalData/storeRecordsInTimestream.js'
import { getAllAccountsSettings } from '../nrfcloud/allAccounts.js'
import {
	Scope,
	deleteSettings,
	getSettings,
	putSettings,
} from '../util/settings.js'
import { configStepRunners } from './steps/config.js'
import { steps as deviceSteps } from './steps/device.js'
import { steps as historicalDataSteps } from './steps/historicalData.js'
import { steps as mocknRFCloudSteps } from './steps/mocknRFCloud.js'
import { steps as storageSteps } from './steps/storage.js'
import { websocketStepRunners } from './steps/websocket.js'
import { steps as userSteps } from './steps/user.js'
import { steps as RESTSteps } from './steps/REST.js'

const ssm = new SSMClient({})

/**
 * This file configures the BDD Feature runner
 * by loading the configuration for the test resources
 * (like AWS services) and providing the required
 * step runners and reporters.
 */

const backendConfig = await stackOutput(
	new CloudFormationClient({}),
)<BackendStackOutputs>(STACK_NAME)

const mapBackendConfig = await stackOutput(
	new CloudFormationClient({}),
)<MapBackendStackOutputs>(MAP_BACKEND_STACK_NAME)

const testConfig = await stackOutput(
	new CloudFormationClient({}),
)<TestStackOutputs>(TEST_RESOURCES_STACK_NAME)
const allAccountSettings = await getAllAccountsSettings({
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
const [DatabaseName, TableName] =
	backendConfig.historicalDataTableInfo.split('|')
if (DatabaseName === undefined || TableName === undefined)
	throw Error('historicalDataTableInfo is not configured')
const storeTimestream = storeRecordsInTimestream({
	timestream: writeTimestream,
	DatabaseName,
	TableName,
})

const print = (arg: unknown) =>
	typeof arg === 'object' ? JSON.stringify(arg) : arg
const start = Date.now()
const ts = () => {
	const diff = Date.now() - start
	return chalk.gray(`[${(diff / 1000).toFixed(3).padStart(8, ' ')}]`)
}

const runner = await runFolder({
	folder: path.join(process.cwd(), 'features'),
	name: 'hello.nrfcloud.com backend',
	logObserver: {
		onDebug: (info, ...args) =>
			console.error(
				ts(),
				chalk.magenta.dim(info.step.keyword),
				chalk.magenta(info.step.title),
				...args.map((arg) => chalk.cyan(print(arg))),
			),
		onError: (info, ...args) =>
			console.error(
				ts(),
				chalk.magenta.dim(info.step.keyword),
				chalk.magenta(info.step.title),
				...args.map((arg) => chalk.cyan(print(arg))),
			),
		onInfo: (info, ...args) =>
			console.error(
				ts(),
				chalk.magenta.dim(info.step.keyword),
				chalk.magenta(info.step.title),
				...args.map((arg) => chalk.cyan(print(arg))),
			),
		onProgress: (info, ...args) =>
			console.error(
				ts(),
				chalk.magenta.dim(info.step.keyword),
				chalk.magenta(info.step.title),
				...args.map((arg) => chalk.cyan(print(arg))),
			),
	},
})

const cleaners: (() => Promise<void>)[] = []

const { steps: webSocketSteps, cleanup: websocketCleanup } =
	websocketStepRunners({
		websocketUri: backendConfig.webSocketURI,
	})
cleaners.push(websocketCleanup)

const { steps: configSteps, cleanup: configCleanup } = configStepRunners({
	configWriter,
	configRemover,
	configSettings,
})
cleaners.push(configCleanup)

runner
	.addStepRunners(...webSocketSteps)
	.addStepRunners(
		...deviceSteps(allAccountSettings, db, {
			devicesTableFingerprintIndexName:
				backendConfig.devicesTableFingerprintIndexName,
			devicesTable: backendConfig.devicesTableName,
		}),
	)
	.addStepRunners(
		...mocknRFCloudSteps({
			db,
			ssm,
			stackName: STACK_NAME,
			responsesTableName: testConfig.responsesTableName,
			requestsTableName: testConfig.requestsTableName,
		}),
	)
	.addStepRunners(
		...historicalDataSteps({
			timestream,
			storeTimestream,
			historicalDataTableInfo: backendConfig.historicalDataTableInfo,
		}),
	)
	.addStepRunners(...storageSteps())
	.addStepRunners(...configSteps)
	.addStepRunners(...userSteps)
	.addStepRunners(...RESTSteps)

const res = await runner.run({
	shareDeviceAPI: new URL(mapBackendConfig.shareAPIURL),
	confirmOwnershipAPI: new URL(mapBackendConfig.confirmOwnershipAPIURL),
	sharingStatusAPI: new URL(mapBackendConfig.sharingStatusAPIURL),
	devicesAPI: new URL(mapBackendConfig.devicesAPIURL),
})

await Promise.all(cleaners.map(async (fn) => fn()))

console.error(`Writing to stdout ...`)
process.stdout.write(JSON.stringify(res, null, 2), () => {
	console.error(`Done`, res.ok ? chalk.green('OK') : chalk.red('ERROR'))
})
