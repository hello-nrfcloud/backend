import {
	Duration,
	aws_iam as IAM,
	aws_iot as IoT,
	aws_lambda as Lambda,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { PackedLambda } from '../helpers/lambdas/packLambda.js'
import type { DeviceStorage } from './DeviceStorage.js'
import { IoTActionRole } from './IoTActionRole.js'
import { LambdaSource } from './LambdaSource.js'
import type { WebsocketEventBus } from './WebsocketEventBus.js'
import { LambdaLogGroup } from './LambdaLogGroup.js'

/**
 * Resources needed to convert messages sent by nRF Cloud to the format that hello.nrfcloud.com expects
 */
export class ConvertDeviceMessages extends Construct {
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			websocketEventBus,
			deviceStorage,
		}: {
			deviceStorage: DeviceStorage
			websocketEventBus: WebsocketEventBus
			lambdaSources: {
				onDeviceMessage: PackedLambda
			}
			layers: Lambda.ILayerVersion[]
		},
	) {
		super(parent, 'converter')

		const onDeviceMessage = new Lambda.Function(this, 'onDeviceMessage', {
			handler: lambdaSources.onDeviceMessage.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(5),
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.onDeviceMessage).code,
			description: 'Convert device messages and publish them on the EventBus',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				EVENTBUS_NAME: websocketEventBus.eventBus.eventBusName,
				DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				DEVICES_INDEX_NAME: deviceStorage.devicesTableFingerprintIndexName,
				NODE_NO_WARNINGS: '1',
				DISABLE_METRICS: this.node.tryGetContext('isTest') === true ? '1' : '0',
			},
			layers,
			...new LambdaLogGroup(this, 'onDeviceMessageLogs'),
		})
		websocketEventBus.eventBus.grantPutEventsTo(onDeviceMessage)
		deviceStorage.devicesTable.grantReadData(onDeviceMessage)

		const rule = new IoT.CfnTopicRule(this, 'topicRule', {
			topicRulePayload: {
				description: `Convert received message and publish to the EventBus`,
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: `
					select
						* as message,
						topic(4) as deviceId,
						timestamp() as timestamp
					from 'data/+/+/+/+'
					where messageType = 'DATA'
				`,
				actions: [
					{
						lambda: {
							functionArn: onDeviceMessage.functionArn,
						},
					},
				],
				errorAction: {
					republish: {
						roleArn: new IoTActionRole(this).roleArn,
						topic: 'errors',
					},
				},
			},
		})

		onDeviceMessage.addPermission('topicRule', {
			principal: new IAM.ServicePrincipal('iot.amazonaws.com'),
			sourceArn: rule.attrArn,
		})
	}
}
