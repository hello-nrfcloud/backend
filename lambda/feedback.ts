import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
	Context,
} from 'aws-lambda'
import { getFeedbackSettings } from '../settings/feedback.js'
import { SSMClient } from '@aws-sdk/client-ssm'
import { fromEnv } from '@bifravst/from-env'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { Type } from '@sinclair/typebox'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import middy from '@middy/core'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { HttpStatusCode } from '@hello.nrfcloud.com/proto/hello'
import {
	validateInput,
	type ValidInput,
} from '@hello.nrfcloud.com/lambda-helpers/validateInput'

const { stackName, version } = fromEnv({
	version: 'VERSION',
	stackName: 'STACK_NAME',
})(process.env)

const ssm = new SSMClient({})

const settings = await getFeedbackSettings({ ssm, stackName })

const InputSchema = Type.Object({
	stars: Type.Integer({ minimum: 1, maximum: 5, title: 'Star rating' }),
	suggestion: Type.String({ minLength: 1, title: 'Suggestion' }),
	email: Type.RegExp(/.+@.+/, { title: 'Email' }),
})

const h = async (
	event: APIGatewayProxyEventV2,
	context: ValidInput<typeof InputSchema> & Context,
): Promise<APIGatewayProxyResultV2> => {
	const { stars, email, suggestion } = context.validInput

	const res = await fetch(settings.webhookURL, {
		method: 'POST',
		headers: {
			'content-type': 'application/json; charset=utf-8',
		},
		// The Adaptive Card format is required to support Outlook on iOS and Android. However, if you are sending actionable messages via an Office connector, or to a Microsoft Teams connector, you must continue to use the message card format.
		// @see https://learn.microsoft.com/en-us/outlook/actionable-messages/message-card-reference
		body: JSON.stringify({
			summary: 'New feedback',
			themeColor: '00a9ce',
			title: 'New feedback received',
			sections: [
				{
					facts: [
						{
							name: 'Rating:',
							value: '★'.repeat(stars) + '☆'.repeat(5 - stars),
						},
						{
							name: 'Email:',
							value: email,
						},
					],
					text: suggestion,
				},
			],
		}),
	})

	if (!res.ok) {
		console.error(await res.text())
		return aProblem({
			title: 'Failed to submit feedback',
			status: HttpStatusCode.INTERNAL_SERVER_ERROR,
		})
	}

	return aResponse(201)
}

export const handler = middy()
	.use(corsOPTIONS('POST'))
	.use(addVersionHeader(version))
	.use(requestLogger())
	.use(validateInput(InputSchema))
	.handler(h)
