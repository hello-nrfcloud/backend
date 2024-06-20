import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { tryAsJSON } from '@hello.nrfcloud.com/lambda-helpers/tryAsJSON'
import { devices } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	BadRequestError,
	HttpStatusCode,
	LwM2MObjectUpdate,
	deviceId,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import inputOutputLogger from '@middy/input-output-logger'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { Type } from '@sinclair/typebox/type'
import type { APIGatewayProxyResultV2 } from 'aws-lambda'
import { getDeviceById } from '../devices/getDeviceById.js'
import { objectsToShadow } from '../lwm2m/objectsToShadow.js'
import { getAllNRFCloudAPIConfigs } from './getAllNRFCloudAPIConfigs.js'
import { loggingFetch } from './loggingFetch.js'
import { validateInput, type ValidInput } from './middleware/validateInput.js'

const { stackName, version, DevicesTableName } = fromEnv({
	stackName: 'STACK_NAME',
	version: 'VERSION',
	DevicesTableName: 'DEVICES_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})
const getDevice = getDeviceById({
	db,
	DevicesTableName,
})

const ssm = new SSMClient({})

const allNRFCloudAPIConfigs = getAllNRFCloudAPIConfigs({ ssm, stackName })()

const { track } = metricsForComponent('configureDevice')

const trackFetch = loggingFetch({ track, log: logger('configureDevice') })

const InputSchema = Type.Object({
	id: deviceId,
	fingerprint: Type.RegExp(fingerprintRegExp),
	update: LwM2MObjectUpdate,
})

/**
 * Handle configure device request
 */
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

	const update = devices(
		{
			endpoint: apiEndpoint,
			apiKey,
		},
		trackFetch,
	)
	const res = await update.updateState(deviceId, {
		desired: {
			lwm2m: objectsToShadow([event.validInput.update]),
		},
	})

	if ('success' in res) {
		console.debug(`Accepted`)
		return aResponse(HttpStatusCode.ACCEPTED)
	} else {
		console.error(`Update failed`, JSON.stringify(res))
		return aProblem(
			BadRequestError({
				title: `Configuration update failed`,
				detail: res.error.message,
			}),
		)
	}
}

export const handler = middy()
	.use(inputOutputLogger())
	.use(
		validateInput(InputSchema, (event) => ({
			...(event.queryStringParameters ?? {}),
			...(event.pathParameters ?? {}),
			update: {
				...tryAsJSON(event.body),
				ts: new Date().toISOString(),
			},
		})),
	)
	.use(addVersionHeader(version))
	.use(corsOPTIONS('PATCH'))
	.handler(h)
