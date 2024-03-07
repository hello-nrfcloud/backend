import lambda from 'aws-lambda'
import { type MiddlewareObj } from '@middy/core'
import { corsHeaders } from './corsHeaders.js'

export const corsOPTIONS = (
	...allowedMethods: string[]
): MiddlewareObj<
	lambda.APIGatewayProxyEventV2,
	lambda.APIGatewayProxyStructuredResultV2
> => ({
	before: async (req) => {
		if (req.event.requestContext.http.method === 'OPTIONS') {
			return {
				statusCode: 200,
				headers: corsHeaders(req.event, allowedMethods),
			}
		}
		return undefined
	},
	after: async (req) => {
		if (req.response === null) return
		req.response = {
			...req.response,
			headers: {
				...req.response.headers,
				...corsHeaders(req.event, allowedMethods),
			},
		}
	},
})
