import { Context } from '@hello.nrfcloud.com/proto/hello'
import {
	Duration,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_iam as IAM,
	aws_lambda as Lambda,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { Scope } from '../../settings/settings.js'
import type { PackedLambda } from '@bifravst/aws-cdk-lambda-helpers'
import { LambdaSource } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { WebsocketEventBus } from './WebsocketEventBus.js'
import { LambdaLogGroup } from '@bifravst/aws-cdk-lambda-helpers/cdk'

/**
 * Handles device configuration requests
 */
export class ConfigureDevice extends Construct {
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			websocketEventBus,
		}: {
			websocketEventBus: WebsocketEventBus
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
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(5),
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.configureDevice).code,
			description: 'Handle device configuration request',
			environment: {
				VERSION: this.node.getContext('version'),
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				EVENTBUS_NAME: websocketEventBus.eventBus.eventBusName,
				NODE_NO_WARNINGS: '1',
				STACK_NAME: Stack.of(this).stackName,
			},
			layers,
			...new LambdaLogGroup(this, 'configureDeviceLogs'),
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
			eventBus: websocketEventBus.eventBus,
		})
		websocketEventBus.eventBus.grantPutEventsTo(configureDevice)
	}
}
