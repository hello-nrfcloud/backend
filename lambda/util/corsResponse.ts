import type {
	APIGatewayProxyEventHeaders,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { corsHeaders } from './corsHeaders.js'

export const corsResponse = (event: {
	headers: APIGatewayProxyEventHeaders
}): APIGatewayProxyResultV2 => ({
	statusCode: 200,
	headers: corsHeaders(event),
})
