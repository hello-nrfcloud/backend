import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { fromEnv } from '@nordicsemiconductor/from-env'
import lambda, { type APIGatewayProxyResultV2 } from 'aws-lambda'
import { Type } from '@sinclair/typebox'
import { publicDevicesRepo } from '../../map/publicDevicesRepo.js'
import { aResponse } from '../util/aResponse.js'
import { aProblem } from '../util/aProblem.js'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import { DeviceId } from '@hello.nrfcloud.com/proto/hello/map'
import {
	formatTypeBoxErrors,
	validateWithTypeBox,
} from '@hello.nrfcloud.com/proto'
import { corsHeaders } from '../util/corsHeaders.js'

const { publicDevicesTableName } = fromEnv({
	publicDevicesTableName: 'PUBLIC_DEVICES_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})

const publicDevice = publicDevicesRepo({
	db,
	TableName: publicDevicesTableName,
})

const validateInput = validateWithTypeBox(
	Type.Object({
		id: DeviceId,
		token: Type.RegExp(/^[0-9A-Z]{6}$/, {
			title: 'Ownership Confirmation Token',
			description: 'The 6 character token to confirm the ownership.',
			examples: ['RPGWT2'],
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

	const { id, token } = maybeValidInput.value

	const maybeConfirmed = await publicDevice.confirmOwnership({
		deviceId: id,
		ownershipConfirmationToken: token,
	})
	if ('error' in maybeConfirmed) {
		return aProblem(cors, {
			title: `Failed to confirm your ownership: ${maybeConfirmed.error.message}`,
			status: 400,
		})
	}

	console.debug(JSON.stringify({ id }))

	return aResponse(cors, 200, {
		'@context': Context.map.shareDevice.ownershipConfirmed,
		id,
	})
}
