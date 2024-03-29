import {
	App,
	CfnOutput,
	aws_lambda as Lambda,
	Stack,
	type Environment,
} from 'aws-cdk-lib'
import type { PackedLambda } from '../helpers/lambdas/packLambda.js'
import type { PackedLayer } from '../helpers/lambdas/packLayer.js'
import { LambdaSource } from '../resources/LambdaSource.js'
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
			env,
		}: {
			lambdaSources: {
				httpApiMock: PackedLambda
			}
			layer: PackedLayer
			env: Required<Environment>
		},
	) {
		super(parent, TEST_RESOURCES_STACK_NAME, { env })

		const baseLayer = new Lambda.LayerVersion(this, 'baseLayer', {
			layerVersionName: `${Stack.of(this).stackName}-baseLayer`,
			code: new LambdaSource(this, {
				id: 'baseLayer',
				zipFile: layer.layerZipFile,
				hash: layer.hash,
			}).code,
			compatibleArchitectures: [Lambda.Architecture.ARM_64],
			compatibleRuntimes: [Lambda.Runtime.NODEJS_20_X],
		})

		const httpMockApi = new HttpApiMock(this, {
			lambdaSources,
			layers: [baseLayer],
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
