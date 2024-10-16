import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
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
import { tryAsJSON } from '@hello.nrfcloud.com/lambda-helpers/tryAsJSON'
import {
	validateInput,
	type ValidInput,
} from '@hello.nrfcloud.com/lambda-helpers/validateInput'
import { devices } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { objectsToShadow } from '@hello.nrfcloud.com/proto-map/lwm2m/aws'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	BadRequestError,
	HttpStatusCode,
	LwM2MObjectUpdate,
	deviceId,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { Type } from '@sinclair/typebox/type'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
	Context,
} from 'aws-lambda'
import { updateLwM2MShadow } from '../lwm2m/updateLwM2MShadow.js'
import { loggingFetch } from '../util/loggingFetch.js'
import { withDevice, type WithDevice } from './middleware/withDevice.js'
import { getAllNRFCloudAPIConfigs } from './nrfcloud/getAllNRFCloudAPIConfigs.js'

const { stackName, version, DevicesTableName } = fromEnv({
	stackName: 'STACK_NAME',
	version: 'VERSION',
	DevicesTableName: 'DEVICES_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})
const iotData = new IoTDataPlaneClient({})
const ssm = new SSMClient({})

const allNRFCloudAPIConfigs = getAllNRFCloudAPIConfigs({ ssm, stackName })()

const { track } = metricsForComponent('updateDeviceState')

const trackFetch = loggingFetch({ track, log: logger('updateDeviceState') })

const InputSchema = Type.Object({
	deviceId,
	fingerprint: Type.RegExp(fingerprintRegExp),
	update: LwM2MObjectUpdate,
})

const updateShadow = updateLwM2MShadow(iotData)

const h = async (
	event: APIGatewayProxyEventV2,
	context: WithDevice & ValidInput<typeof InputSchema> & Context,
): Promise<APIGatewayProxyResultV2> => {
	const account = context.device.account
	const { apiKey, apiEndpoint } = (await allNRFCloudAPIConfigs)[account] ?? {}
	if (apiKey === undefined || apiEndpoint === undefined)
		throw new Error(`nRF Cloud API key for ${stackName} is not configured.`)

	const nrfCloud = devices(
		{
			endpoint: apiEndpoint,
			apiKey,
		},
		trackFetch,
	)
	const res = await nrfCloud.updateState(context.device.id, {
		desired: {
			lwm2m: objectsToShadow([context.validInput.update]),
		},
	})

	await updateShadow(context.device.id, [], [context.validInput.update])

	if ('success' in res) {
		console.debug(`Accepted`)
		return aResponse(HttpStatusCode.ACCEPTED)
	} else {
		console.error(`Update failed`, JSON.stringify(res))
		throw new ProblemDetailError(
			BadRequestError({
				title: `Configuration update failed`,
				detail: res.error.message,
			}),
		)
	}
}

export const handler = middy()
	.use(corsOPTIONS('PATCH'))
	.use(addVersionHeader(version))
	.use(requestLogger())
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
	.use(problemResponse())
	.handler(h)
