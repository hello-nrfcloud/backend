import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda'

export type AuthorizedEvent = APIGatewayProxyWebsocketEventV2 & {
	requestContext: APIGatewayProxyWebsocketEventV2['requestContext'] & {
		authorizer: {
			principalId: 'me'
		} & WebsocketConnectionContext
	}
}

export type WebsocketConnectionContext =
	| {
			deviceId: string // e.g. 'oob-352656108602296'
			model: string //e.g. "PCA20065",
			hideDataBefore?: string // e.g. '2021-09-01T00:00:00Z'
			account: string // e.g. 'elite'
	  }
	// Unsupported devices have no associated account
	| {
			deviceId: string // e.g. 'oob-352656108602296'
			model: 'unsupported'
	  }
