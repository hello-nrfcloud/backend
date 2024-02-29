import type { APIGatewayProxyEventHeaders } from 'aws-lambda'

const allowedDomains = [
	/^https?:\/\/localhost:/,
	/^https:\/\/hello\.nrfcloud\.com$/,
]
const defaultOrigin = 'https://hello.nrfcloud.com'
const origin = (event: { headers: APIGatewayProxyEventHeaders }): string => {
	const origin = event.headers.origin ?? defaultOrigin.toString()

	if (allowedDomains.find((rx) => rx.test(origin)) !== undefined) return origin

	return defaultOrigin
}

export const corsHeaders = (
	{
		headers,
	}: {
		headers: APIGatewayProxyEventHeaders
	},
	allowedMethods = ['PUT', 'DELETE', 'POST', 'GET', 'PATCH'],
	cacheForSeconds = 600,
): {
	'Access-Control-Allow-Credentials': true
	'Access-Control-Allow-Headers': string
	'Access-Control-Expose-Headers': string
	'Access-Control-Allow-Methods': string
	'Access-Control-Allow-Origin': string
	'Access-Control-Max-Age': number
	Vary: 'Origin'
} => ({
	'Access-Control-Allow-Credentials': true,
	'Access-Control-Allow-Origin': origin({ headers }),
	'Access-Control-Allow-Methods': allowedMethods.join(', '),
	'Access-Control-Allow-Headers': 'content-type, accept, if-match',
	'Access-Control-Expose-Headers': 'x-amzn-requestid, etag',
	'Access-Control-Max-Age': cacheForSeconds,
	// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin#cors_and_caching
	Vary: 'Origin',
})
