import { App } from 'aws-cdk-lib'
import { BackendStack } from './stacks/BackendStack.js'
import { MapStack } from './stacks/MapStack.js'

export class BackendApp extends App {
	public constructor({
		isTest,
		domain,
		...rest
	}: ConstructorParameters<typeof BackendStack>[1] & {
		isTest: boolean
		domain: string
	}) {
		super({
			context: {
				isTest,
				domain,
			},
		})

		new BackendStack(this, rest)
		new MapStack(this, {
			layer: rest.mapsLayer,
			lambdaSources: rest.lambdaSources,
		})
	}
}
