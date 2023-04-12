import { packLambdaFromPath } from './helpers/lambdas/packLambdaFromPath.js'
import { packLayer } from './helpers/lambdas/packLayer.js'
import { TestResources } from './test-resources/TestResourcesApp.js'

new TestResources({
	lambdaSources: {
		httpApiMock: await packLambdaFromPath(
			'httpApiMock',
			'cdk/test-resources/http-api-mock-lambda.ts',
		),
	},
	layer: await packLayer({
		id: 'testResources',
		dependencies: ['@aws-sdk/client-dynamodb', '@nordicsemiconductor/from-env'],
	}),
})
