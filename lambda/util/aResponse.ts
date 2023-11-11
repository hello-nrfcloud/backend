import { type APIGatewayProxyResultV2 } from 'aws-lambda'
import type { HttpStatusCode } from '@hello.nrfcloud.com/proto/hello/errors/StatusCode'

export const aResponse = (
	status: HttpStatusCode,
	result: {
		'@context': URL
	} & Record<string, unknown>,
): APIGatewayProxyResultV2 => ({
	statusCode: status,
	headers: {
		'content-type': 'application/json',
	},
	body: JSON.stringify(result),
})
