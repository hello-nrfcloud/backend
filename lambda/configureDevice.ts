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
import { objectsToShadow } from '../lwm2m/objectsToShadow.js'
import { getAllNRFCloudAPIConfigs } from './getAllNRFCloudAPIConfigs.js'
import { loggingFetch } from './loggingFetch.js'
import { withDevice, type WithDevice } from './middleware/withDevice.js'
import { validateInput, type ValidInput } from './middleware/validateInput.js'

const { stackName, version, DevicesTableName } = fromEnv({
	stackName: 'STACK_NAME',
	version: 'VERSION',
	DevicesTableName: 'DEVICES_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})

const ssm = new SSMClient({})

const allNRFCloudAPIConfigs = getAllNRFCloudAPIConfigs({ ssm, stackName })()

const { track } = metricsForComponent('configureDevice')

const trackFetch = loggingFetch({ track, log: logger('configureDevice') })

const InputSchema = Type.Object({
	deviceId,
	fingerprint: Type.RegExp(fingerprintRegExp),
	update: LwM2MObjectUpdate,
})

/**
 * Handle configure device request
 */
const h = async (
	event: ValidInput<typeof InputSchema> & WithDevice,
): Promise<APIGatewayProxyResultV2> => {
	const account = event.device.account
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
	const res = await update.updateState(event.device.id, {
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
	.use(withDevice({ db, DevicesTableName }))
	.use(addVersionHeader(version))
	.use(corsOPTIONS('PATCH'))
	.handler(h)
