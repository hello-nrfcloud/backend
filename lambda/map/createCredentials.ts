import { getAPISettings } from '../../nrfcloud/settings.js'
import { SSMClient } from '@aws-sdk/client-ssm'
import { STACK_NAME } from '../../cdk/stacks/stackConfig.js'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { devices as devicesApi } from '../../nrfcloud/devices.js'
import { getAccountInfo } from '../../nrfcloud/getAccountInfo.js'
import { publicDevicesRepo } from '../../map/publicDevicesRepo.js'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import middy from '@middy/core'
import { corsOPTIONS } from '../util/corsOPTIONS.js'
import { aProblem } from '../util/aProblem.js'
import { aResponse } from '../util/aResponse.js'

const { backendStackName, openSslLambdaFunctionName, publicDevicesTableName } =
	fromEnv({
		backendStackName: 'BACKEND_STACK_NAME',
		openSslLambdaFunctionName: 'OPENSSL_LAMBDA_FUNCTION_NAME',
		publicDevicesTableName: 'PUBLIC_DEVICES_TABLE_NAME',
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

const repo = publicDevicesRepo({
	db: new DynamoDBClient({}),
	TableName: publicDevicesTableName,
})

/**
 * This registers a custom device, which allows arbitrary users to showcase their products on the map.
 */
const h = async (
	event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
	console.log(JSON.stringify({ event }))

	const accountInfo = await accountInfoPromise
	if ('error' in accountInfo)
		return aProblem({
			status: 500,
			title: 'Missing nRF Cloud Account information',
		})

	const { deviceId } = JSON.parse(event.body ?? '{}')

	if (deviceId.startsWith('map-') === false)
		return aProblem({
			status: 400,
			title: 'Credentials can only be created for custom devices.',
		})

	const maybePublicDevice = await repo.getPrivateRecordByDeviceId(deviceId)

	if ('error' in maybePublicDevice) {
		return aProblem({
			status: 400,
			title: `Invalid device ID ${deviceId}: ${maybePublicDevice.error}`,
		})
	}

	const { ownerEmail: email } = maybePublicDevice.device

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
		return aProblem({
			title: `Registration failed: ${registration.error.message}`,
			status: 500,
		})
	}

	console.log(deviceId, `Registered devices with nRF Cloud`)
	console.log(deviceId, `Bulk ops ID:`, registration.bulkOpsRequestId)

	return aResponse(
		200,
		{
			'@context': new URL(
				'https://github.com/hello-nrfcloud/proto/map/device-credentials',
			),
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

export const handler = middy().use(corsOPTIONS('POST')).handler(h)
