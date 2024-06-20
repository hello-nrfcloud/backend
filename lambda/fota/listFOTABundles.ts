import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
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
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import inputOutputLogger from '@middy/input-output-logger'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { Type, type Static } from '@sinclair/typebox'
import type { APIGatewayProxyResultV2 } from 'aws-lambda'
import { getDeviceById } from '../../devices/getDeviceById.js'
import { getAllNRFCloudAPIConfigs } from '../getAllNRFCloudAPIConfigs.js'
import { loggingFetch } from '../loggingFetch.js'
import { validateInput, type ValidInput } from '../middleware/validateInput.js'

const { stackName, version, DevicesTableName } = fromEnv({
	stackName: 'STACK_NAME',
	version: 'VERSION',
	DevicesTableName: 'DEVICES_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})
const ssm = new SSMClient({})

const allNRFCloudAPIConfigs = getAllNRFCloudAPIConfigs({ ssm, stackName })()

const getDevice = getDeviceById({
	db,
	DevicesTableName,
})

const { track } = metricsForComponent('deviceFOTA')
const trackFetch = loggingFetch({ track, log: logger('deviceFOTA') })

const InputSchema = Type.Object({
	id: deviceId,
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
	event: ValidInput<typeof InputSchema>,
): Promise<APIGatewayProxyResultV2> => {
	const deviceId = event.validInput.id

	const maybeDevice = await getDevice(deviceId)
	if ('error' in maybeDevice) {
		return aProblem({
			title: `No device found with ID!`,
			detail: deviceId,
			status: HttpStatusCode.NOT_FOUND,
		})
	}

	const device = maybeDevice.device
	if (device.fingerprint !== event.validInput.fingerprint) {
		return aProblem({
			title: `Fingerprint does not match!`,
			detail: event.validInput.fingerprint,
			status: HttpStatusCode.FORBIDDEN,
		})
	}

	const account = device.account
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
		return aProblem(
			InternalError({
				title: `Fetching FOTA bundles failed`,
				detail: res.error.message,
			}),
		)
	}

	return aResponse(HttpStatusCode.OK, {
		'@context': Context.fotaBundles,
		deviceId,
		bundles: res.bundles
			.sort((b1, b2) =>
				(b2.lastModified ?? '').localeCompare(b1.lastModified ?? ''),
			)
			.map(toBundle),
	})
}
export const handler = middy()
	.use(inputOutputLogger())
	.use(addVersionHeader(version))
	.use(corsOPTIONS('GET'))
	.use(validateInput(InputSchema))
	.handler(h)

const toBundle = (
	bundleInfo: Static<typeof nRFCloudFOTABundle>,
): Static<typeof FOTABundle> => ({
	'@context': Context.fotaBundle.toString(),
	bundleId: bundleInfo.bundleId,
	type: bundleInfo.type,
	version: bundleInfo.version,
})
