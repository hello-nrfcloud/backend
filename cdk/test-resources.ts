import { STSClient } from '@aws-sdk/client-sts'
import { env } from './helpers/env.js'
import { packLayer } from '@bifravst/aws-cdk-lambda-helpers/layer'
import { packLambdaFromPath } from '@bifravst/aws-cdk-lambda-helpers'
import { TestResources } from './test-resources/TestResourcesApp.js'

const awsEnv = await env({ sts: new STSClient({}) })

new TestResources({
	lambdaSources: {
		httpApiMock: await packLambdaFromPath(
			'httpApiMock',
			'cdk/test-resources/http-api-mock-lambda.ts',
		),
	},
	layer: await packLayer({
		id: 'testResources',
		dependencies: [
			'@aws-sdk/client-dynamodb',
			'@nordicsemiconductor/from-env',
			'@hello.nrfcloud.com/lambda-helpers',
		],
	}),
	env: awsEnv,
})
