import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda'

export type AuthorizedEvent = APIGatewayProxyWebsocketEventV2 & {
	requestContext: APIGatewayProxyWebsocketEventV2['requestContext'] & {
		authorizer: {
			principalId: 'me'
			model: string //e.g. "PCA20035+solar",
			integrationLatency: 1043
			deviceId: string // e.g. 'oob-352656108602296'
		}
	}
}

export type WebsocketConnectionContext = {
	model: string
	deviceId: string
}
