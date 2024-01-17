import type {
	APIGatewayProxyEventHeaders,
	APIGatewayProxyResultV2,
	APIGatewayProxyStructuredResultV2,
} from 'aws-lambda'
import type { HttpStatusCode } from '@hello.nrfcloud.com/proto/hello/errors/StatusCode'
import { corsHeaders } from './corsHeaders.js'

export const aResponse = (
	event: {
		headers: APIGatewayProxyEventHeaders
	},
	status: HttpStatusCode,
	result: {
		'@context': URL
	} & Record<string, unknown>,
	headers?: APIGatewayProxyStructuredResultV2['headers'],
): APIGatewayProxyResultV2 => ({
	statusCode: status,
	headers: {
		'content-type': 'application/json',
		...(headers ?? {}),
		...corsHeaders(event),
	},
	body: JSON.stringify(result),
})
