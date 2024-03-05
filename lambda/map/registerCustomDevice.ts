import { models } from '@hello.nrfcloud.com/proto-lwm2m'
import { getAPISettings } from '../../nrfcloud/settings.js'
import { SSMClient } from '@aws-sdk/client-ssm'
import { STACK_NAME } from '../../cdk/stacks/stackConfig.js'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { aProblem } from '../util/aProblem.js'
import { corsHeaders } from '../util/corsHeaders.js'
import { aResponse } from '../util/aResponse.js'
import { randomUUID } from 'node:crypto'
import { devices as devicesApi } from '../../nrfcloud/devices.js'
import { getAccountInfo } from '../../nrfcloud/getAccountInfo.js'

const { backendStackName, openSslLambdaFunctionName } = fromEnv({
	backendStackName: 'BACKEND_STACK_NAME',
	openSslLambdaFunctionName: 'OPENSSL_LAMBDA_FUNCTION_NAME',
})({
	STACK_NAME,
	...process.env,
})
const ssm = new SSMClient({})

const { apiKey, apiEndpoint } = await getAPISettings({
	ssm,
	stackName: backendStackName,
	account: 'nordic',
})()

const accountInfoPromise = getAccountInfo({ endpoint: apiEndpoint, apiKey })

const client = devicesApi({
	endpoint: apiEndpoint,
	apiKey,
})

const lambda = new LambdaClient({})

const knownModels = Object.keys(models)

/**
 * This registers a custom device, which allows arbitrary users to showcase their products on the map.
 */
export const handler = async (
	event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
	console.log(JSON.stringify({ event }))
	const cors = corsHeaders(event, ['POST'], 60)
	if (event.requestContext.http.method === 'OPTIONS')
		return {
			statusCode: 200,
			headers: cors,
		}

	const { model, email } = JSON.parse(event.body ?? '{}')
	if (!knownModels.includes(model))
		return aProblem(cors, {
			title: `Unknown model: ${model}. Valid models are: ${knownModels.join(', ')}.`,
			status: 400,
		})

	const accountInfo = await accountInfoPromise
	if ('error' in accountInfo)
		return aProblem(cors, {
			status: 500,
			title: 'Missing nRF Cloud Account information',
		})

	const deviceId = `map-${randomUUID()}`
	const { privateKey, certificate } = JSON.parse(
		(
			await lambda.send(
				new InvokeCommand({
					FunctionName: openSslLambdaFunctionName,
					Payload: JSON.stringify({
						id: deviceId,
						email,
					}),
				}),
			)
		).Payload?.transformToString() ?? '',
	)

	const registration = await client.register([
		{
			deviceId,
			subType: 'map-custom',
			tags: ['map', 'map-custom'],
			certPem: certificate,
		},
	])

	if ('error' in registration) {
		console.error(
			deviceId,
			`registration failed`,
			JSON.stringify(registration.error),
		)
		return aProblem(cors, {
			title: `Registration failed: ${registration.error.message}`,
			status: 500,
		})
	}

	console.log(deviceId, `Registered devices with nRF Cloud`)
	console.log(deviceId, `Bulk ops ID:`, registration.bulkOpsRequestId)

	return aResponse(
		cors,
		200,
		{
			'@context': new URL(
				'https://github.com/hello-nrfcloud/proto/map/device-credentials',
			),
			device: {
				deviceId,
				model,
			},
			mqtt: {
				endpoint: accountInfo.mqttEndpoint,
				topic: {
					senML: `${accountInfo.mqttTopicPrefix}m/senml/${deviceId}`,
				},
			},
			credentials: {
				privateKey,
				certificate,
			},
		},
		0,
		{
			'x-bulk-ops-request-id': registration.bulkOpsRequestId,
		},
	)
}
