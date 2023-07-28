import {
	Duration,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_iam as IAM,
	aws_lambda as Lambda,
	aws_logs as Logs,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { type Settings as BridgeSettings } from '../../bridge/settings.js'
import type { PackedLambda } from '../helpers/lambdas/packLambda.js'
import type { DeviceStorage } from './DeviceStorage.js'
import type { WebsocketAPI } from './WebsocketAPI.js'
import { LambdaSource } from './LambdaSource.js'

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
			code: new LambdaSource(this, lambdaSources.healthCheck).code,
			description: 'End to end test for mqtt bridge',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				NODE_NO_WARNINGS: '1',
				STACK_NAME: Stack.of(this).stackName,
				DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				WEBSOCKET_URL: websocketAPI.websocketURI,
				DISABLE_METRICS: this.node.tryGetContext('isTest') === true ? '1' : '0',
			},
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['ssm:GetParametersByPath', 'ssm:GetParameter'],
					resources: [
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/thirdParty`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/thirdParty/*`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/nRFCloud/accounts`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/nRFCloud/accounts/*`,
					],
				}),
			],
			layers,
			logRetention: Logs.RetentionDays.ONE_WEEK,
		})
		scheduler.addTarget(new EventTargets.LambdaFunction(healthCheck))
		deviceStorage.devicesTable.grantWriteData(healthCheck)
	}
}
