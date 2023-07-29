import {
	Duration,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_lambda as Lambda,
	aws_logs as Logs,
	aws_iam as IAM,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { PackedLambda } from '../helpers/lambdas/packLambda.js'
import { LambdaSource } from './LambdaSource.js'
import type { WebsocketAPI } from './WebsocketAPI.js'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import { Scope } from '../../util/settings.js'

/**
 * Handles device configuration requests
 */
export class ConfigureDevice extends Construct {
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			websocketAPI,
		}: {
			websocketAPI: WebsocketAPI
			lambdaSources: {
				configureDevice: PackedLambda
			}
			layers: Lambda.ILayerVersion[]
		},
	) {
		super(parent, 'configureDevice')

		const configureDevice = new Lambda.Function(this, 'configureDevice', {
			handler: lambdaSources.configureDevice.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.seconds(5),
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.configureDevice).code,
			description: 'Handle device configuration request',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				EVENTBUS_NAME: websocketAPI.eventBus.eventBusName,
				NODE_NO_WARNINGS: '1',
				STACK_NAME: Stack.of(this).stackName,
			},
			layers,
			logRetention: Logs.RetentionDays.ONE_WEEK,
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['ssm:GetParametersByPath', 'ssm:GetParameter'],
					resources: [
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/${
							Scope.NRFCLOUD_ACCOUNT_PREFIX
						}`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/${
							Scope.NRFCLOUD_ACCOUNT_PREFIX
						}/*`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/nRFCloud/accounts`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/nRFCloud/accounts/*`,
					],
				}),
			],
		})
		new Events.Rule(this, 'configureDeviceRule', {
			eventPattern: {
				source: ['thingy.ws'],
				detailType: [Context.configureDevice.toString()],
			},
			targets: [new EventTargets.LambdaFunction(configureDevice)],
			eventBus: websocketAPI.eventBus,
		})
		websocketAPI.eventBus.grantPutEventsTo(configureDevice)
	}
}
