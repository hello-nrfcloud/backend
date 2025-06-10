import { fromEnv } from '@bifravst/from-env'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { type APIGatewayProxyResultV2 } from 'aws-lambda'

const { version } = fromEnv({
	version: 'VERSION',
})(process.env)

export const handler = middy<void, APIGatewayProxyResultV2>()
	.use(corsOPTIONS('POST'))
	.use(addVersionHeader(version))
	.use(requestLogger())
	.handler(async () =>
		aResponse(200, {
			'@context': Context.apiHealth,
			version,
		}),
	)
