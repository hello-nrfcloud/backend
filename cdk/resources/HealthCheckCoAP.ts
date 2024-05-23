import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import {
	Duration,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_lambda as Lambda,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'
import type { WebsocketAPI } from './WebsocketAPI.js'

export class HealthCheckCoAP extends Construct {
	public constructor(
		parent: Construct,
		{
			websocketAPI,
			deviceStorage,
			code,
			layers,
			lambdaSources,
		}: {
			websocketAPI: WebsocketAPI
			deviceStorage: DeviceStorage
			code: Lambda.DockerImageCode
			layers: Lambda.ILayerVersion[]
			lambdaSources: Pick<BackendLambdas, 'healthCheckForCoAP'>
		},
	) {
		super(parent, 'HealthCheckCoAP')

		const scheduler = new Events.Rule(this, 'scheduler', {
			description: `Scheduler to health check CoAP`,
			schedule: Events.Schedule.rate(Duration.minutes(1)),
		})

		// Lambda functions
		const coapLambda = new Lambda.DockerImageFunction(this, 'coapSimulator', {
			timeout: Duration.seconds(30),
			description: 'CoAP simulator (JAVA) - lambda container image',
			code,
		})

		const healthCheckCoAP = new PackedLambdaFn(
			this,
			'healthCheckCoAP',
			lambdaSources.healthCheckForCoAP,
			{
				timeout: Duration.seconds(30),
				description: 'End to end test for CoAP to mqtt bridge',
				environment: {
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
					WEBSOCKET_URL: websocketAPI.websocketURI,
					COAP_LAMBDA: coapLambda.functionName,
				},
				layers,
			},
		).fn
		scheduler.addTarget(new EventTargets.LambdaFunction(healthCheckCoAP))
		deviceStorage.devicesTable.grantWriteData(healthCheckCoAP)
		coapLambda.grantInvoke(healthCheckCoAP)
	}
}
