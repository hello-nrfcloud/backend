import {
	LambdaLogGroup,
	LambdaSource,
} from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { Permissions as SettingsPermissions } from '@bifravst/aws-ssm-settings-helpers/cdk'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import {
	Duration,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_lambda as Lambda,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { WebsocketEventBus } from './WebsocketEventBus.js'

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
			lambdaSources: Pick<BackendLambdas, 'configureDevice'>
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
				EVENTBUS_NAME: websocketEventBus.eventBus.eventBusName,
				NODE_NO_WARNINGS: '1',
				STACK_NAME: Stack.of(this).stackName,
			},
			layers,
			...new LambdaLogGroup(this, 'configureDeviceLogs'),
			initialPolicy: [SettingsPermissions(Stack.of(this))],
		})
		new Events.Rule(this, 'configureDeviceRule', {
			eventPattern: {
				source: ['hello.ws'],
				detailType: [Context.configureDevice.toString()],
			},
			targets: [new EventTargets.LambdaFunction(configureDevice)],
			eventBus: websocketEventBus.eventBus,
		})
		websocketEventBus.eventBus.grantPutEventsTo(configureDevice)
	}
}
