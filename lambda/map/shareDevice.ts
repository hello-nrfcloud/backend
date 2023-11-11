import {
	ConditionalCheckFailedException,
	DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import lambda, { type APIGatewayProxyResultV2 } from 'aws-lambda'
import { Type } from '@sinclair/typebox'
import { models } from '@hello.nrfcloud.com/proto-lwm2m'
import { publicDevicesRepo } from '../../map/publicDevicesRepo.js'
import { validateWithTypeBox } from '../../util/validateWithTypeBox.js'
import { formatTypeBoxErrors } from '../util/formatTypeBoxErrors.js'
import { SESClient } from '@aws-sdk/client-ses'
import { sendOwnershipVerificationEmail } from './sendOwnershipVerificationEmail.js'
import { aResponse } from '../util/aResponse.js'
import { aProblem } from '../util/aProblem.js'

const { publicDevicesTableName, publicDevicesTableIdIndexName, fromEmail } =
	fromEnv({
		publicDevicesTableName: 'PUBLIC_DEVICES_TABLE_NAME',
		publicDevicesTableIdIndexName: 'PUBLIC_DEVICES_TABLE_ID_INDEX_NAME',
		fromEmail: 'FROM_EMAIL',
	})(process.env)

const db = new DynamoDBClient({})
const ses = new SESClient({})

const publicDevice = publicDevicesRepo({
	db,
	TableName: publicDevicesTableName,
	IdIndexName: publicDevicesTableIdIndexName,
})

const sendEmail = sendOwnershipVerificationEmail(ses, fromEmail)

const validateInput = validateWithTypeBox(
	Type.Object({
		deviceId: Type.RegExp(/^[a-zA-Z0-9:_-]{1,128}$/, {
			title: 'Device ID',
			description: 'Must follow the AWS IoT limitations for Thing names.',
		}),
		model: Type.Union(
			Object.keys(models).map((s) => Type.Literal(s)),
			{
				title: 'Model',
				description:
					'Must be one of the models defined in @hello.nrfcloud.com/proto-lwm2m',
			},
		),
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

	const maybeValidInput = validateInput(JSON.parse(event.body ?? '{}'))
	if ('errors' in maybeValidInput) {
		return aProblem({
			title: 'Validation failed',
			status: 400,
			detail: formatTypeBoxErrors(maybeValidInput.errors),
		})
	}

	const { deviceId, model, email } = maybeValidInput.value

	const maybePublished = await publicDevice.share({
		deviceId,
		model,
		email,
	})
	if ('error' in maybePublished) {
		if (maybePublished.error instanceof ConditionalCheckFailedException) {
			return aProblem({
				title: `Failed to share device: ${maybePublished.error.message}`,
				status: 409,
			})
		}
		console.error(maybePublished.error)
		return aProblem({
			title: `Failed to share device: ${maybePublished.error.message}`,
			status: 500,
		})
	}
	await sendEmail({
		email,
		deviceId,
		ownershipConfirmationToken:
			maybePublished.publicDevice.ownershipConfirmationToken,
	})

	console.debug(JSON.stringify({ deviceId, model, email }))

	return aResponse(200, {
		'@context': new URL(
			`https://github.com/hello-nrfcloud/backend/map/share-device-request`,
		),
		id: maybePublished.publicDevice.id,
	})
}
