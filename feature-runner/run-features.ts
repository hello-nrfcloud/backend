import { CloudFormationClient } from '@aws-sdk/client-cloudformation'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { runFolder } from '@bifravst/bdd-markdown'
import { stackOutput } from '@bifravst/cloudformation-helpers'
import chalk from 'chalk'
import path from 'node:path'
import type { StackOutputs as BackendStackOutputs } from '../cdk/BackendStack.js'
import { STACK_NAME } from '../cdk/stackConfig.js'
import { steps as CoAPDeviceSteps } from './steps/device/CoAP.js'
import { steps as MQTTDeviceSteps } from './steps/device/MQTT.js'
import { steps as deviceRegistrySteps } from './steps/device/registry.js'
import { steps as mocknRFCloudSteps } from './steps/mocknRFCloud.js'
import { steps as storageSteps } from '@hello.nrfcloud.com/bdd-markdown-steps/storage'
import { steps as httpApiMockSteps } from '@hello.nrfcloud.com/bdd-markdown-steps/httpApiMock'
import {
	steps as randomSteps,
	UUIDv4,
	email,
	IMEI,
} from '@hello.nrfcloud.com/bdd-markdown-steps/random'
import { websocketStepRunners } from './steps/websocket.js'
import { steps as userSteps } from './steps/user.js'
import { steps as RESTSteps } from '@hello.nrfcloud.com/bdd-markdown-steps/REST'
import { fromEnv } from '@bifravst/from-env'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { getAllAccountsSettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'

const { responsesTableName, requestsTableName, httpApiMockURL } = fromEnv({
	responsesTableName: 'HTTP_API_MOCK_RESPONSES_TABLE_NAME',
	requestsTableName: 'HTTP_API_MOCK_REQUESTS_TABLE_NAME',
	httpApiMockURL: 'HTTP_API_MOCK_API_URL',
})(process.env)

const ssm = new SSMClient({})
const iotData = new IoTDataPlaneClient({})
const db = new DynamoDBClient({})

/**
 * This file configures the BDD Feature runner
 * by loading the configuration for the test resources
 * (like AWS services) and providing the required
 * step runners and reporters.
 */

const backendConfig = await stackOutput(
	new CloudFormationClient({}),
)<BackendStackOutputs>(STACK_NAME)

const allAccountSettings = await getAllAccountsSettings({
	ssm,
	stackName: STACK_NAME,
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

runner
	.addStepRunners(...webSocketSteps)
	.addStepRunners(
		...deviceRegistrySteps(db, {
			devicesTableFingerprintIndexName:
				backendConfig.devicesTableFingerprintIndexName,
			devicesTable: backendConfig.devicesTableName,
		}),
	)
	.addStepRunners(...CoAPDeviceSteps({ iotData }))
	.addStepRunners(...MQTTDeviceSteps({ allAccountSettings }))
	.addStepRunners(
		...mocknRFCloudSteps({
			db,
			ssm,
			stackName: STACK_NAME,
			responsesTableName,
			requestsTableName,
		}),
	)
	.addStepRunners(...storageSteps)
	.addStepRunners(...userSteps)
	.addStepRunners(...RESTSteps)
	.addStepRunners(
		...httpApiMockSteps({
			db,
			requestsTableName,
			responsesTableName,
			httpMockApiURL: new URL(httpApiMockURL),
		}),
	)
	.addStepRunners(
		...randomSteps({
			UUIDv4,
			email,
			IMEI,
			cellId: () =>
				(10000000 + Math.floor(Math.random() * 100000000)).toString(),
		}),
	)

const res = await runner.run({
	APIURL: backendConfig.APIURL.toString().replace(/\/+$/, ''),
	feedbackWebhookURL: new URL(
		'./webhook.office.com/',
		httpApiMockURL,
	).toString(),
	memfaultApiEndpoint: new URL('./api.memfault.com/', httpApiMockURL)
		.toString()
		.replace(/\/+$/, ''),
	VERSION: process.env.VERSION ?? '0.0.0-development',
})

await Promise.all(cleaners.map(async (fn) => fn()))

console.error(`Writing to stdout ...`)
process.stdout.write(JSON.stringify(res, null, 2), () => {
	console.error(`Done`, res.ok ? chalk.green('OK') : chalk.red('ERROR'))
})
