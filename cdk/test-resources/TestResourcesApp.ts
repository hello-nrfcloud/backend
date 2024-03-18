import { App, type Environment } from 'aws-cdk-lib'
import type { PackedLambda } from '../helpers/lambdas/packLambda.js'
import type { PackedLayer } from '../helpers/lambdas/packLayer.js'
import { TestResourcesStack } from './TestResourcesStack.js'

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
