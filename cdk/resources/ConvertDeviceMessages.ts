import {
	Duration,
	aws_iam as IAM,
	aws_iot as IoT,
	aws_lambda as Lambda,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { PackedLambda } from '../helpers/lambdas/packLambda.js'
import { LambdaLogGroup } from './LambdaLogGroup.js'
import type { WebsocketAPI } from './WebsocketAPI.js'

/**
 * Resources needed to convert messages sent by nRF Cloud to the format that nRF Guide expects
 */
export class ConvertDeviceMessages extends Construct {
	public constructor(
		parent: Stack,
		{
			lambdaSources,
			layers,
			websocketAPI,
		}: {
			websocketAPI: WebsocketAPI
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
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.seconds(5),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.onDeviceMessage.zipFile),
			description: 'Convert device messages and publish them on the EventBus',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				EVENTBUS_NAME: websocketAPI.eventBus.eventBusName,
				DEVICES_TABLE_NAME: websocketAPI.devicesTable.tableName,
				DEVICES_INDEX_NAME: websocketAPI.devicesTableCodeIndexName,
			},
			layers,
		})
		new LambdaLogGroup(this, 'onDeviceMessageLogs', onDeviceMessage)
		websocketAPI.eventBus.grantPutEventsTo(onDeviceMessage)
		websocketAPI.devicesTable.grantReadData(onDeviceMessage)

		const iotActionRole = new IAM.Role(this, 'iot-action-role', {
			assumedBy: new IAM.ServicePrincipal(
				'iot.amazonaws.com',
			) as IAM.IPrincipal,
			inlinePolicies: {
				rootPermissions: new IAM.PolicyDocument({
					statements: [
						new IAM.PolicyStatement({
							actions: ['iot:Publish'],
							resources: [
								`arn:aws:iot:${parent.region}:${parent.account}:topic/errors`,
							],
						}),
					],
				}),
			},
		})

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
						roleArn: iotActionRole.roleArn,
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
