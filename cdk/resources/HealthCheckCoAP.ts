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
	public readonly healthCheckCoAP: PackedLambdaFn
	public readonly coapLambda: PackedLambdaFn
	public constructor(
		parent: Construct,
		{
			websocketAPI,
			deviceStorage,
			layers,
			lambdaSources,
		}: {
			websocketAPI: WebsocketAPI
			deviceStorage: DeviceStorage
			layers: Lambda.ILayerVersion[]
			lambdaSources: Pick<
				BackendLambdas,
				'healthCheckForCoAP' | 'healthCheckForCoAPClient'
			>
		},
	) {
		super(parent, 'HealthCheckCoAP')

		const scheduler = new Events.Rule(this, 'scheduler', {
			description: `Scheduler to health check CoAP`,
			schedule: Events.Schedule.rate(Duration.minutes(1)),
		})

		// Lambda functions
		this.coapLambda = new PackedLambdaFn(
			this,
			'client',
			lambdaSources.healthCheckForCoAPClient,
			{
				runtime: Lambda.Runtime.PROVIDED_AL2023,
				timeout: Duration.seconds(30),
				description: 'Sends binary payload to the nRF Cloud CoAP server',
				environment: {},
			},
		)

		this.healthCheckCoAP = new PackedLambdaFn(
			this,
			'healthCheckCoAP',
			lambdaSources.healthCheckForCoAP,
			{
				timeout: Duration.seconds(30),
				description: 'End to end test for CoAP to mqtt bridge',
				environment: {
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
					WEBSOCKET_URL: websocketAPI.websocketURI,
					COAP_LAMBDA: this.coapLambda.fn.functionName,
				},
				layers,
			},
		)
		scheduler.addTarget(
			new EventTargets.LambdaFunction(this.healthCheckCoAP.fn),
		)
		deviceStorage.devicesTable.grantWriteData(this.healthCheckCoAP.fn)
		this.coapLambda.fn.grantInvoke(this.healthCheckCoAP.fn)
	}
}
