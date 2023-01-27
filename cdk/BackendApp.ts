import { App } from 'aws-cdk-lib'
import type { BackendLambdas } from './BackendLambdas.js'
import type { PackedLayer } from './packLayer.js'
import { BackendStack } from './stacks/BackendStack.js'

export class BackendApp extends App {
	public constructor({
		lambdaSources,
		layer,
		assetTrackerStackName,
	}: {
		lambdaSources: BackendLambdas
		layer: PackedLayer
		assetTrackerStackName: string
	}) {
		super()
		new BackendStack(this, { lambdaSources, layer, assetTrackerStackName })
	}
}
