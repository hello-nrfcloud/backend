import { App } from 'aws-cdk-lib'
import type { PackedLambda } from '../backend'
import type { PackedLayer } from '../packLayer.js'
import { TestResourcesStack } from './TestResourcesStack.js'

export class TestResources extends App {
	public constructor({
		lambdaSources,
		context,
		layer,
	}: {
		lambdaSources: {
			httpApiMock: PackedLambda
		}
		layer: PackedLayer
		context?: Record<string, any>
	}) {
		super({ context })
		new TestResourcesStack(this, { lambdaSources, layer })
	}
}
