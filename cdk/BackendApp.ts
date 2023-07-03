import { App } from 'aws-cdk-lib'
import { BackendStack } from './stacks/BackendStack.js'

export class BackendApp extends App {
	public constructor({
		isTest,
		...rest
	}: ConstructorParameters<typeof BackendStack>[1] & { isTest: boolean }) {
		super({
			context: {
				isTest,
			},
		})

		new BackendStack(this, rest)
	}
}
