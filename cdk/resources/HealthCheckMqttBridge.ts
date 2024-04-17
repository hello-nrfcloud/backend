import { type ECRImage as BridgeSettings } from '@bifravst/aws-cdk-ecr-helpers/image'
import {
	LambdaLogGroup,
	LambdaSource,
} from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { Permissions as SettingsPermissions } from '@bifravst/aws-ssm-settings-helpers/cdk'
import {
	Duration,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_lambda as Lambda,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'
import type { WebsocketAPI } from './WebsocketAPI.js'

export type BridgeImageSettings = BridgeSettings

export class HealthCheckMqttBridge extends Construct {
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
		super(parent, 'healthCheckMqttBridge')

		const scheduler = new Events.Rule(this, 'scheduler', {
			description: `Scheduler to health check mqtt bridge`,
			schedule: Events.Schedule.rate(Duration.minutes(1)),
		})

		// Lambda functions
		const healthCheck = new Lambda.Function(this, 'healthCheck', {
			handler: lambdaSources.healthCheck.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(15),
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.healthCheck).code,
			description: 'End to end test for mqtt bridge',
			environment: {
				VERSION: this.node.getContext('version'),
				NODE_NO_WARNINGS: '1',
				STACK_NAME: Stack.of(this).stackName,
				DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				WEBSOCKET_URL: websocketAPI.websocketURI,
				DISABLE_METRICS: this.node.getContext('isTest') === true ? '1' : '0',
			},
			initialPolicy: [SettingsPermissions(Stack.of(this))],
			layers,
			...new LambdaLogGroup(this, 'healthCheckLogs'),
		})
		scheduler.addTarget(new EventTargets.LambdaFunction(healthCheck))
		deviceStorage.devicesTable.grantWriteData(healthCheck)
	}
}
