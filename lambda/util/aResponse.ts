import type {
	APIGatewayProxyResultV2,
	APIGatewayProxyStructuredResultV2,
} from 'aws-lambda'
import type { HttpStatusCode } from '@hello.nrfcloud.com/proto/hello/errors/StatusCode'

export const aResponse = (
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
	},
	body: JSON.stringify(result),
})
