import {
	ConditionalCheckFailedException,
	DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import lambda, { type APIGatewayProxyResultV2 } from 'aws-lambda'
import { Type } from '@sinclair/typebox'
import { publicDevicesRepo } from '../../map/publicDevicesRepo.js'
import { SESClient } from '@aws-sdk/client-ses'
import { sendOwnershipVerificationEmail } from './sendOwnershipVerificationEmail.js'
import { aResponse } from '../util/aResponse.js'
import { aProblem } from '../util/aProblem.js'
import { DeviceId, Model } from '@hello.nrfcloud.com/proto/hello/map'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import {
	formatTypeBoxErrors,
	validateWithTypeBox,
} from '@hello.nrfcloud.com/proto'
import { corsHeaders } from '../util/corsHeaders.js'
import { randomUUID } from 'node:crypto'

const { publicDevicesTableName, fromEmail, isTestString } = fromEnv({
	publicDevicesTableName: 'PUBLIC_DEVICES_TABLE_NAME',
	fromEmail: 'FROM_EMAIL',
	isTestString: 'IS_TEST',
})(process.env)

const isTest = isTestString === '1'

const db = new DynamoDBClient({})
const ses = new SESClient({})

const publicDevice = publicDevicesRepo({
	db,
	TableName: publicDevicesTableName,
})

const sendEmail = sendOwnershipVerificationEmail(ses, fromEmail)

const validateInput = validateWithTypeBox(
	Type.Object({
		// If no deviceID is provided a new deviceID is generated.
		// This is useful in case a custom device needs to be published.
		deviceId: Type.Optional(DeviceId),
		model: Model,
		email: Type.RegExp(/.+@.+/, {
			title: 'Email',
			description:
				'The email of the owner of the device. They have to confirm the publication of the device every 30 days.',
		}),
	}),
)

export const handler = async (
	event: lambda.APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
	console.log(JSON.stringify(event))

	const cors = corsHeaders(event, ['POST'])
	if (event.requestContext.http.method === 'OPTIONS')
		return {
			statusCode: 200,
			headers: cors,
		}

	const maybeValidInput = validateInput(JSON.parse(event.body ?? '{}'))
	if ('errors' in maybeValidInput) {
		return aProblem(cors, {
			title: 'Validation failed',
			status: 400,
			detail: formatTypeBoxErrors(maybeValidInput.errors),
		})
	}

	const { deviceId: maybeDeviceId, model, email } = maybeValidInput.value

	// TODO: limit the amount of devices that can be created
	const deviceId = maybeDeviceId ?? `map-${randomUUID()}`

	const maybePublished = await publicDevice.share({
		deviceId,
		model,
		email,
		generateToken: isTest ? () => '123456' : undefined,
	})
	if ('error' in maybePublished) {
		if (maybePublished.error instanceof ConditionalCheckFailedException) {
			return aProblem(cors, {
				title: `Failed to share device: ${maybePublished.error.message}`,
				status: 409,
			})
		}
		console.error(maybePublished.error)
		return aProblem(cors, {
			title: `Failed to share device: ${maybePublished.error.message}`,
			status: 500,
		})
	}
	if (!isTest)
		await sendEmail({
			email,
			deviceId,
			ownershipConfirmationToken:
				maybePublished.publicDevice.ownershipConfirmationToken,
		})

	console.debug(JSON.stringify({ deviceId, model, email }))

	return aResponse(cors, 200, {
		'@context': Context.map.shareDevice.request,
		id: maybePublished.publicDevice.id,
		deviceId,
	})
}
