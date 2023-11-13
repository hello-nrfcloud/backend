import { Construct } from 'constructs'
import {
	aws_lambda as Lambda,
	aws_iam as IAM,
	aws_logs as Logs,
	aws_iot as IoT,
	Duration,
} from 'aws-cdk-lib'
import type { PackedLambda } from '../../helpers/lambdas/packLambda.js'
import type { PublicDevices } from './PublicDevices.js'
import { IoTActionRole } from '../IoTActionRole.js'

/**
 * Manages the LwM2M shadow of the public devices
 */
export class LwM2MShadow extends Construct {
	constructor(
		parent: Construct,
		{
			baseLayer,
			lambdaSources,
			publicDevices,
		}: {
			baseLayer: Lambda.ILayerVersion
			lambdaSources: {
				updatesToLwM2M: PackedLambda
			}
			publicDevices: PublicDevices
		},
	) {
		super(parent, 'lwm2m-shadow')

		const updatesToLwM2M = new Lambda.Function(this, 'updatesToLwM2M', {
			handler: lambdaSources.updatesToLwM2M.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.minutes(15),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.updatesToLwM2M.zipFile),
			description:
				'Store shadow updates asset_tracker_v2 shadow format as LwM2M objects in a named shadow.',
			layers: [baseLayer],
			environment: {
				VERSION: this.node.tryGetContext('version'),
				PUBLIC_DEVICES_TABLE_NAME: publicDevices.publicDevicesTable.tableName,
				PUBLIC_DEVICES_TABLE_ID_INDEX_NAME:
					publicDevices.publicDevicesTablePublicIdIndexName,
			},
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['iot:UpdateThingShadow'],
					resources: ['*'],
				}),
			],
			logRetention: Logs.RetentionDays.ONE_WEEK,
		})
		publicDevices.publicDevicesTable.grantReadData(updatesToLwM2M)

		const rule = new IoT.CfnTopicRule(this, 'rule', {
			topicRulePayload: {
				description: `Convert devices messages to LwM2M`,
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: [
					`SELECT * as message,`,
					`topic(4) as deviceId`,
					`FROM 'data/m/d/+/+'`, // 'data/m/d/<device Id>/d2c' and 'data/m/d/<device Id>/c2d'
					`WHERE messageType = 'DATA'`,
				].join(' '),
				actions: [
					{
						lambda: {
							functionArn: updatesToLwM2M.functionArn,
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

		updatesToLwM2M.addPermission('invokeByRule', {
			principal: new IAM.ServicePrincipal(
				'iot.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: rule.attrArn,
		})
	}
}
