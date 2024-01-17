import type {
	APIGatewayProxyEventHeaders,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { type Static } from '@sinclair/typebox'
import { Context, ProblemDetail } from '@hello.nrfcloud.com/proto/hello'
import { corsHeaders } from './corsHeaders.js'

export const aProblem = (
	event: {
		headers: APIGatewayProxyEventHeaders
	},
	problem: Omit<Static<typeof ProblemDetail>, '@context'>,
): APIGatewayProxyResultV2 => ({
	statusCode: problem.status,
	headers: {
		'content-type': 'application/problem+json',
		...corsHeaders(event),
	},
	body: JSON.stringify({
		'@context': Context.problemDetail.toString(),
		...problem,
	}),
})
