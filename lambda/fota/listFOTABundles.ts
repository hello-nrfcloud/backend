import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { fromEnv } from '@bifravst/from-env'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import {
	ProblemDetailError,
	problemResponse,
} from '@hello.nrfcloud.com/lambda-helpers/problemResponse'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import {
	validateInput,
	type ValidInput,
} from '@hello.nrfcloud.com/lambda-helpers/validateInput'
import {
	getFOTABundles,
	type ValidationError,
	type FOTABundle as nRFCloudFOTABundle,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	Context,
	HttpStatusCode,
	InternalError,
	deviceId,
	type FOTABundle,
	type FOTABundles,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { Type, type Static } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { loggingFetch } from '../../util/loggingFetch.js'
import { withDevice, type WithDevice } from '../middleware/withDevice.js'
import { getAllNRFCloudAPIConfigs } from '../nrfcloud/getAllNRFCloudAPIConfigs.js'

const { stackName, version, DevicesTableName } = fromEnv({
	stackName: 'STACK_NAME',
	version: 'VERSION',
	DevicesTableName: 'DEVICES_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})
const ssm = new SSMClient({})

const allNRFCloudAPIConfigs = getAllNRFCloudAPIConfigs({ ssm, stackName })()

const { track } = metricsForComponent('deviceFOTA')
const trackFetch = loggingFetch({ track, log: logger('deviceFOTA') })

const InputSchema = Type.Object({
	deviceId,
	fingerprint: Type.RegExp(fingerprintRegExp),
})

const bundlesPromise = new Map<
	string,
	Promise<
		| {
				error: Error | ValidationError
		  }
		| {
				bundles: Array<Static<typeof nRFCloudFOTABundle>>
		  }
	>
>()

const h = async (
	event: APIGatewayProxyEventV2,
	context: ValidInput<typeof InputSchema> & WithDevice,
): Promise<APIGatewayProxyResultV2> => {
	const account = context.device.account
	const { apiKey, apiEndpoint } = (await allNRFCloudAPIConfigs)[account] ?? {}
	if (apiKey === undefined || apiEndpoint === undefined)
		throw new Error(`nRF Cloud API key for ${stackName} is not configured.`)

	if (!bundlesPromise.has(account)) {
		const list = getFOTABundles(
			{
				endpoint: apiEndpoint,
				apiKey,
			},
			trackFetch,
		)
		bundlesPromise.set(account, list())
	}
	const res = await bundlesPromise.get(account)!

	if ('error' in res) {
		throw new ProblemDetailError(
			InternalError({
				title: `Fetching FOTA bundles failed`,
				detail: res.error.message,
			}),
		)
	}

	const result: Static<typeof FOTABundles> = {
		'@context': Context.fotaBundles.toString(),
		deviceId: context.validInput.deviceId,
		bundles: res.bundles
			.sort((b1, b2) =>
				(b2.lastModified ?? '').localeCompare(b1.lastModified ?? ''),
			)
			.map(toBundle),
	}

	return aResponse(HttpStatusCode.OK, {
		...result,
		'@context': Context.fotaBundles,
	})
}
export const handler = middy()
	.use(corsOPTIONS('GET'))
	.use(addVersionHeader(version))
	.use(requestLogger())
	.use(validateInput(InputSchema))
	.use(withDevice({ db, DevicesTableName }))
	.use(problemResponse())
	.handler(h)

const toBundle = (
	bundleInfo: Static<typeof nRFCloudFOTABundle>,
): Static<typeof FOTABundle> => ({
	'@context': Context.fotaBundle.toString(),
	bundleId: bundleInfo.bundleId,
	type: bundleInfo.type,
	version: bundleInfo.version,
})
