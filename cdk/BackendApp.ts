import { App } from 'aws-cdk-lib'
import type { MqttConfiguration } from './backend.js'
import type { BackendLambdas } from './BackendLambdas.js'
import type { PackedLayer } from './packLayer.js'
import { BackendStack } from './stacks/BackendStack.js'

export class BackendApp extends App {
	public constructor({
		lambdaSources,
		layer,
		mqttConfiguration,
	}: {
		lambdaSources: BackendLambdas
		layer: PackedLayer
		mqttConfiguration: MqttConfiguration
	}) {
		super()
		new BackendStack(this, { lambdaSources, layer, mqttConfiguration })
	}
}
