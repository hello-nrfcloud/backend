import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import {
	type ValidationError,
	getFOTABundles,
	type FOTABundle as nRFCloudFOTABundle,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import {
	formatTypeBoxErrors,
	validateWithTypeBox,
} from '@hello.nrfcloud.com/proto'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	Context,
	type FOTABundle,
	HttpStatusCode,
	InternalError,
	deviceId,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { Type, type Static } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { getDeviceById } from '../../devices/getDeviceById.js'
import { getAllNRFCloudAPIConfigs } from '../getAllNRFCloudAPIConfigs.js'
import { loggingFetch } from '../loggingFetch.js'

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

const validateInput = validateWithTypeBox(
	Type.Object({
		id: deviceId,
		fingerprint: Type.RegExp(fingerprintRegExp),
	}),
)

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
): Promise<APIGatewayProxyResultV2> => {
	console.info('event', { event })

	const maybeValidInput = validateInput({
		...(event.queryStringParameters ?? {}),
		...(event.pathParameters ?? {}),
	})
	if ('errors' in maybeValidInput) {
		return aProblem({
			title: 'Validation failed',
			status: HttpStatusCode.BAD_REQUEST,
			detail: formatTypeBoxErrors(maybeValidInput.errors),
		})
	}

	const deviceId = maybeValidInput.value.id

	const maybeDevice = await getDevice(deviceId)
	if ('error' in maybeDevice) {
		return aProblem({
			title: `No device found with ID!`,
			detail: deviceId,
			status: HttpStatusCode.NOT_FOUND,
		})
	}

	const device = maybeDevice.device
	if (device.fingerprint !== maybeValidInput.value.fingerprint) {
		return aProblem({
			title: `Fingerprint does not match!`,
			detail: maybeValidInput.value.fingerprint,
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
		bundles: res.bundles.map(toBundle),
	})
}
export const handler = middy()
	.use(addVersionHeader(version))
	.use(corsOPTIONS('PATCH'))
	.handler(h)

const toBundle = (
	bundleInfo: Static<typeof nRFCloudFOTABundle>,
): Static<typeof FOTABundle> => ({
	'@context': Context.fotaBundle.toString(),
	bundleId: bundleInfo.bundleId,
	type: bundleInfo.type,
	version: bundleInfo.version,
})
