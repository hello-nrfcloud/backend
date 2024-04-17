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
			memorySize: 1792,
			timeout: Duration.seconds(30),
			description: 'CoAP simulator (JAVA) - lambda container image',
			code,
		})

		const healthCheckCoAP = new Lambda.Function(this, 'healthCheckCoAP', {
			handler: lambdaSources.healthCheckForCoAP.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(30),
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.healthCheckForCoAP).code,
			description: 'End to end test for CoAP to mqtt bridge',
			environment: {
				VERSION: this.node.getContext('version'),
				NODE_NO_WARNINGS: '1',
				STACK_NAME: Stack.of(this).stackName,
				DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				WEBSOCKET_URL: websocketAPI.websocketURI,
				COAP_LAMBDA: coapLambda.functionName,
			},
			initialPolicy: [SettingsPermissions(Stack.of(this))],
			layers,
			...new LambdaLogGroup(this, 'healthCheckCoAPLogs'),
		})
		scheduler.addTarget(new EventTargets.LambdaFunction(healthCheckCoAP))
		deviceStorage.devicesTable.grantWriteData(healthCheckCoAP)
		coapLambda.grantInvoke(healthCheckCoAP)
	}
}
