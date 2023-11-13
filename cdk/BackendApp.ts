import { App } from 'aws-cdk-lib'
import { BackendStack } from './stacks/BackendStack.js'
import { MapBackendStack } from './stacks/MapBackendStack.js'
import type { MapBackendLambdas } from './MapBackendLambdas.js'

export class BackendApp extends App {
	public constructor({
		isTest,
		domain,
		MapBackendLambdasources,
		...rest
	}: ConstructorParameters<typeof BackendStack>[1] & {
		isTest: boolean
		domain: string
		MapBackendLambdasources: MapBackendLambdas
	}) {
		super({
			context: {
				isTest,
				domain,
			},
		})

		new BackendStack(this, rest)

		new MapBackendStack(this, {
			layer: rest.mapLayer,
			lambdaSources: MapBackendLambdasources,
		})
	}
}
