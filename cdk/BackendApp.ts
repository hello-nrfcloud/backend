import { App } from 'aws-cdk-lib'
import { BackendStack } from './BackendStack.js'

export class BackendApp extends App {
	public constructor({
		isTest,
		domain,
		version,
		...backendArgs
	}: ConstructorParameters<typeof BackendStack>[1] & {
		isTest: boolean
		domain: string
		version: string
	}) {
		super({
			context: {
				isTest,
				domain,
				version,
			},
		})

		new BackendStack(this, backendArgs)
	}
}
