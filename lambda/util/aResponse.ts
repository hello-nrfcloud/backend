import type {
	APIGatewayProxyResultV2,
	APIGatewayProxyStructuredResultV2,
} from 'aws-lambda'
import type { HttpStatusCode } from '@hello.nrfcloud.com/proto/hello/errors/StatusCode'
import { corsHeaders } from './corsHeaders.js'

export const aResponse = (
	cors: ReturnType<typeof corsHeaders>,
	status: HttpStatusCode,
	result: {
		'@context': URL
	} & Record<string, unknown>,
	cacheForSeconds: number = 60,
	headers?: APIGatewayProxyStructuredResultV2['headers'],
): APIGatewayProxyResultV2 => ({
	statusCode: status,
	headers: {
		'content-type': 'application/json',
		'Cache-Control':
			cacheForSeconds > 0 ? `public, max-age=${cacheForSeconds}` : 'no-store',
		...(headers ?? {}),
		...cors,
	},
	body: JSON.stringify(result),
})
