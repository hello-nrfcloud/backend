import {
	Duration,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_iam as IAM,
	aws_lambda as Lambda,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { type Settings as BridgeSettings } from '../../bridge/settings.js'
import type { PackedLambda } from '../helpers/lambdas/packLambda.js'
import type { DeviceStorage } from './DeviceStorage.js'
import { LambdaLogGroup } from './LambdaLogGroup.js'
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
			lambdaSources: {
				healthCheck: PackedLambda
			}
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
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.seconds(15),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.healthCheck.zipFile),
			description: 'End to end test for mqtt bridge',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				NODE_NO_WARNINGS: '1',
				STACK_NAME: Stack.of(this).stackName,
				DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				WEBSOCKET_URL: websocketAPI.websocketURI,
			},
			initialPolicy: [],
			layers,
		})
		const ssmReadPolicy = new IAM.PolicyStatement({
			effect: IAM.Effect.ALLOW,
			actions: ['ssm:GetParametersByPath'],
			resources: [
				`arn:aws:ssm:${Stack.of(this).region}:${
					Stack.of(this).account
				}:parameter/${Stack.of(this).stackName}/thirdParty/nrfcloud`,
			],
		})
		healthCheck.addToRolePolicy(ssmReadPolicy)
		scheduler.addTarget(new EventTargets.LambdaFunction(healthCheck))
		deviceStorage.devicesTable.grantWriteData(healthCheck)
		new LambdaLogGroup(this, 'healthCheckLog', healthCheck)
	}
}
