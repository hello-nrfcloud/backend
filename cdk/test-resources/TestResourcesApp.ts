import { App, type Environment } from 'aws-cdk-lib'
import { TestResourcesStack } from './TestResourcesStack.js'
import type { PackedLambda } from '@bifravst/aws-cdk-lambda-helpers'
import type { PackedLayer } from '@bifravst/aws-cdk-lambda-helpers/layer'

export class TestResources extends App {
	public constructor({
		lambdaSources,
		context,
		layer,
		env,
	}: {
		lambdaSources: {
			httpApiMock: PackedLambda
		}
		layer: PackedLayer
		context?: Record<string, any>
		env: Required<Environment>
	}) {
		super({
			context: {
				...context,
				isTest: true,
			},
		})
		new TestResourcesStack(this, { lambdaSources, layer, env })
	}
}
