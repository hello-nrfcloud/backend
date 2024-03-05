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

const { stackName, openSslLambdaFunctionName } = fromEnv({
	stackName: 'STACK_NAME',
	openSslLambdaFunctionName: 'OPENSSL_LAMBDA_FUNCTION_NAME',
})({
	STACK_NAME,
	...process.env,
})
const ssm = new SSMClient({})

const { apiKey, apiEndpoint } = await getAPISettings({
	ssm,
	stackName,
	account: 'nordic',
})()

const client = devicesApi({
	endpoint: apiEndpoint,
	apiKey,
})

const lambda = new LambdaClient({})

/**
 * This registers a custom device, which allows arbitrary users to showcase their products on the map.
 *
 * TODO: add email validation step
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

	const deviceId = `map-${randomUUID()}`
	const { key, cert } = JSON.parse(
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

	if (!Object.keys(models).includes(model))
		return aProblem(cors, {
			title: `Unknown model: ${model}`,
			status: 400,
		})

	const registration = await client.register([
		{
			deviceId,
			subType: 'map-custom',
			tags: ['map', 'map-custom'],
			certPem: cert,
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
			deviceId,
			key,
			cert,
		},
		0,
		{
			'X-bulkOpsRequestId': registration.bulkOpsRequestId,
		},
	)
}
