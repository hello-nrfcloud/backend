import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { Context } from '@hello.nrfcloud.com/proto-map/api'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { type APIGatewayProxyResultV2 } from 'aws-lambda'

const { version } = fromEnv({
	version: 'VERSION',
})(process.env)

const h = async (): Promise<APIGatewayProxyResultV2> => {
	return aResponse(200, {
		'@context': Context.named('api/health'),
		version,
	})
}

export const handler = middy()
	.use(addVersionHeader(version))
	.use(corsOPTIONS('POST'))
	.handler(h)
