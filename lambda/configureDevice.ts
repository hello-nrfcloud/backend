import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { devices } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { getAllAccountsSettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import {
	formatTypeBoxErrors,
	validateWithTypeBox,
} from '@hello.nrfcloud.com/proto'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	BadRequestError,
	HttpStatusCode,
	LwM2MObjectUpdate,
	deviceId,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { Type } from '@sinclair/typebox/type'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { once } from 'lodash-es'
import { getDeviceById } from '../devices/getDeviceById.js'
import { objectsToShadow } from '../lwm2m/objectsToShadow.js'
import { loggingFetch } from './loggingFetch.js'

const { stackName, version, DevicesTableName } = fromEnv({
	stackName: 'STACK_NAME',
	version: 'VERSION',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	DevicesIndexName: 'DEVICES_INDEX_NAME',
})(process.env)

const db = new DynamoDBClient({})
const getDevice = getDeviceById({
	db,
	DevicesTableName,
})

const ssm = new SSMClient({})

const { track } = metricsForComponent('configureDevice')

const getAllNRFCloudAPIConfigs: () => Promise<
	Record<
		string,
		{
			apiKey: string
			apiEndpoint: URL
		}
	>
> = once(async () => {
	const allAccountsSettings = await getAllAccountsSettings({
		ssm,
		stackName,
	})
	return Object.entries(allAccountsSettings).reduce(
		(result, [account, settings]) => ({
			...result,
			[account]: {
				apiKey: settings.apiKey,
				apiEndpoint: new URL(
					settings.apiEndpoint ?? 'https://api.nrfcloud.com/',
				),
			},
		}),
		{},
	)
})

const trackFetch = loggingFetch({ track, log: logger('configureDevice') })

const validateInput = validateWithTypeBox(
	Type.Object({
		id: deviceId,
		fingerprint: Type.Optional(Type.RegExp(fingerprintRegExp)),
		update: LwM2MObjectUpdate,
	}),
)

/**
 * Handle configure device request
 */
const h = async (
	event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
	console.info('event', { event })

	const maybeValidInput = validateInput({
		...(event.queryStringParameters ?? {}),
		...(event.pathParameters ?? {}),
		update: tryAsJSON(event.body),
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
	const apiConfigs = await getAllNRFCloudAPIConfigs()
	const { apiKey, apiEndpoint } = apiConfigs[account] ?? {}
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
			lwm2m: objectsToShadow([maybeValidInput.value.update]),
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
	.use(addVersionHeader(version))
	.use(corsOPTIONS('PATCH'))
	.handler(h)

const tryAsJSON = (body: any): Record<string, any> | undefined => {
	if (typeof body !== 'string') return undefined
	try {
		return JSON.parse(body)
	} catch {
		return undefined
	}
}
