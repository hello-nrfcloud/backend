import { App, CfnOutput, aws_lambda as Lambda, Stack } from 'aws-cdk-lib'
import type { PackedLambda } from '../helpers/lambdas/packLambda.js'
import type { PackedLayer } from '../helpers/lambdas/packLayer.js'
import { TEST_RESOURCES_STACK_NAME } from '../stacks/stackConfig.js'
import { HttpApiMock } from './HttpApiMock.js'

/**
 * This is CloudFormation stack sets up a dummy HTTP API which stores all requests in SQS for inspection
 */
export class TestResourcesStack extends Stack {
	public constructor(
		parent: App,
		{
			lambdaSources,
			layer,
		}: {
			lambdaSources: {
				httpApiMock: PackedLambda
			}
			layer: PackedLayer
		},
	) {
		super(parent, TEST_RESOURCES_STACK_NAME)

		const baseLayer = new Lambda.LayerVersion(this, 'baseLayer', {
			code: Lambda.Code.fromAsset(layer.layerZipFile),
			compatibleArchitectures: [Lambda.Architecture.ARM_64],
			compatibleRuntimes: [Lambda.Runtime.NODEJS_18_X],
		})
		const powerToolLayer = Lambda.LayerVersion.fromLayerVersionArn(
			this,
			'powertoolsLayer',
			`arn:aws:lambda:${
				Stack.of(this).region
			}:094274105915:layer:AWSLambdaPowertoolsTypeScript:7`,
		)

		const httpMockApi = new HttpApiMock(this, {
			lambdaSources,
			layers: [baseLayer, powerToolLayer],
		})

		// Export these so the test runner can use them
		new CfnOutput(this, 'apiURL', {
			value: httpMockApi.api.url,
			exportName: `${this.stackName}:apiURL`,
		})
		new CfnOutput(this, 'responsesTableName', {
			value: httpMockApi.responsesTable.tableName,
			exportName: `${this.stackName}:responsesTableName`,
		})
		new CfnOutput(this, 'requestsTableName', {
			value: httpMockApi.requestsTable.tableName,
			exportName: `${this.stackName}:requestsTableName`,
		})
	}
}

export type StackOutputs = {
	apiURL: string
	requestsTableName: string
	responsesTableName: string
}
