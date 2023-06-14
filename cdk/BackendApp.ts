import { App } from 'aws-cdk-lib'
import { BackendStack } from './stacks/BackendStack.js'

export class BackendApp extends App {
	public constructor(args: ConstructorParameters<typeof BackendStack>[1]) {
		super()

		new BackendStack(this, args)
	}
}
