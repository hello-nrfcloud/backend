import { type ECRImage as BridgeSettings } from '@bifravst/aws-cdk-ecr-helpers/image'
import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { aws_lambda as Lambda } from 'aws-cdk-lib'
import {
	Duration,
	aws_events_targets as EventTargets,
	aws_events as Events,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'
import type { WebsocketAPI } from './WebsocketAPI.js'

export type BridgeImageSettings = BridgeSettings

export class HealthCheckMqtt extends Construct {
	public readonly healthCheck: PackedLambdaFn
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
			lambdaSources: Pick<BackendLambdas, 'healthCheck' | 'healthCheckForCoAP'>
		},
	) {
		super(parent, 'HealthCheckMqtt')

		const scheduler = new Events.Rule(this, 'scheduler', {
			description: `Scheduler to health check mqtt bridge`,
			schedule: Events.Schedule.rate(Duration.minutes(1)),
		})

		// Lambda functions
		this.healthCheck = new PackedLambdaFn(
			this,
			'healthCheck',
			lambdaSources.healthCheck,
			{
				timeout: Duration.seconds(15),
				description: 'End to end test for mqtt bridge',
				environment: {
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
					WEBSOCKET_URL: websocketAPI.websocketURI,
				},
				layers,
			},
		)
		scheduler.addTarget(new EventTargets.LambdaFunction(this.healthCheck.fn))
		deviceStorage.devicesTable.grantWriteData(this.healthCheck.fn)
	}
}
