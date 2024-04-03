import { Construct } from 'constructs'
import {
	aws_lambda as Lambda,
	aws_iam as IAM,
	aws_iot as IoT,
	Duration,
} from 'aws-cdk-lib'
import type { PackedLambda } from '@bifravst/aws-cdk-lambda-helpers'
import type { PublicDevices } from './PublicDevices.js'
import { IoTActionRole } from '../IoTActionRole.js'
import { LambdaLogGroup } from '../LambdaLogGroup.js'

/**
 * Handle incoming SenML messages
 */
export class SenMLMessages extends Construct {
	constructor(
		parent: Construct,
		{
			baseLayer,
			lambdaSources,
			publicDevices,
		}: {
			baseLayer: Lambda.ILayerVersion
			lambdaSources: {
				senMLToLwM2M: PackedLambda
			}
			publicDevices: PublicDevices
		},
	) {
		super(parent, 'senml-messages')

		const fn = new Lambda.Function(this, 'fn', {
			handler: lambdaSources.senMLToLwM2M.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.minutes(15),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.senMLToLwM2M.zipFile),
			description:
				'Convert incoming SenML to LwM2M and store as objects in a named shadow.',
			layers: [baseLayer],
			environment: {
				VERSION: this.node.getContext('version'),
				PUBLIC_DEVICES_TABLE_NAME: publicDevices.publicDevicesTable.tableName,
			},
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['iot:UpdateThingShadow'],
					resources: ['*'],
				}),
			],
			...new LambdaLogGroup(this, 'fnLogs'),
		})
		publicDevices.publicDevicesTable.grantReadData(fn)

		const rule = new IoT.CfnTopicRule(this, 'rule', {
			topicRulePayload: {
				description: `Convert SenML messages to LwM2M`,
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: [
					`SELECT * as message,`,
					`topic(4) as deviceId`,
					`FROM 'data/m/senml/+'`, // 'data/m/senml/<device Id>'
				].join(' '),
				actions: [
					{
						lambda: {
							functionArn: fn.functionArn,
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

		fn.addPermission('invokeByRule', {
			principal: new IAM.ServicePrincipal(
				'iot.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: rule.attrArn,
		})
	}
}
