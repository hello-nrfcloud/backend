import { App } from 'aws-cdk-lib'
import { BackendStack } from './BackendStack.ts'

export class BackendApp extends App {
	public constructor({
		isTest,
		version,
		...backendArgs
	}: ConstructorParameters<typeof BackendStack>[1] & {
		isTest: boolean
		version: string
	}) {
		super({
			context: {
				isTest,
				version,
			},
		})

		new BackendStack(this, backendArgs)
	}
}
