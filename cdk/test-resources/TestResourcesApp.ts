import { App, type Environment } from 'aws-cdk-lib'
import type { PackedLambda } from '../helpers/lambdas/packLambda'
import type { PackedLayer } from '../helpers/lambdas/packLayer'
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
		super({ context })
		new TestResourcesStack(this, { lambdaSources, layer, env })
	}
}
