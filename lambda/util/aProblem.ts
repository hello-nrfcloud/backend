import type { APIGatewayProxyResultV2 } from 'aws-lambda'
import { type Static } from '@sinclair/typebox'
import { Context, ProblemDetail } from '@hello.nrfcloud.com/proto/hello'
import { corsHeaders } from './corsHeaders.js'

export const aProblem = (
	cors: ReturnType<typeof corsHeaders>,
	problem: Omit<Static<typeof ProblemDetail>, '@context'>,
): APIGatewayProxyResultV2 => ({
	statusCode: problem.status,
	headers: {
		'content-type': 'application/problem+json',
		...cors,
	},
	body: JSON.stringify({
		'@context': Context.problemDetail.toString(),
		...problem,
	}),
})
