import {
	Duration,
	aws_lambda as Lambda,
	aws_logs as Logs,
	aws_iam as IAM,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { PackedLambda } from '../../helpers/lambdas/packLambda'
import type { PublicDevices } from './PublicDevices.js'

export class ShareAPI extends Construct {
	public readonly shareURL: Lambda.FunctionUrl
	public readonly confirmOwnershipURL: Lambda.FunctionUrl
	constructor(
		parent: Construct,
		{
			baseLayer,
			lambdaSources,
			publicDevices,
		}: {
			publicDevices: PublicDevices
			baseLayer: Lambda.ILayerVersion
			lambdaSources: {
				shareDevice: PackedLambda
				confirmOwnership: PackedLambda
			}
		},
	) {
		super(parent, 'shareAPI')

		const domain = this.node.tryGetContext('domain')

		const shareFn = new Lambda.Function(this, 'shareFn', {
			handler: lambdaSources.shareDevice.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.minutes(1),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.shareDevice.zipFile),
			description: 'Invoked by a user that wants to share a device',
			layers: [baseLayer],
			environment: {
				VERSION: this.node.tryGetContext('version'),
				PUBLIC_DEVICES_TABLE_NAME: publicDevices.publicDevicesTable.tableName,
				FROM_EMAIL: `notification@${domain}`,
				NODE_NO_WARNINGS: '1',
				IS_TEST: this.node.tryGetContext('isTest') === true ? '1' : '0',
			},
			logRetention: Logs.RetentionDays.ONE_WEEK,
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['ses:SendEmail'],
					resources: [
						`arn:aws:ses:${Stack.of(parent).region}:${
							Stack.of(parent).account
						}:identity/${domain}`,
					],
					conditions: {
						StringLike: {
							'ses:FromAddress': `notification@${domain}`,
						},
					},
				}),
			],
		})
		publicDevices.publicDevicesTable.grantWriteData(shareFn)
		this.shareURL = shareFn.addFunctionUrl({
			authType: Lambda.FunctionUrlAuthType.NONE,
		})

		const confirmOwnershipFn = new Lambda.Function(this, 'confirmOwnershipFn', {
			handler: lambdaSources.confirmOwnership.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.minutes(1),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.confirmOwnership.zipFile),
			description:
				'Invoked by a user that wants confirm their device ownership.',
			layers: [baseLayer],
			environment: {
				VERSION: this.node.tryGetContext('version'),
				PUBLIC_DEVICES_TABLE_NAME: publicDevices.publicDevicesTable.tableName,
				NODE_NO_WARNINGS: '1',
			},
			logRetention: Logs.RetentionDays.ONE_WEEK,
		})
		publicDevices.publicDevicesTable.grantReadWriteData(confirmOwnershipFn)
		this.confirmOwnershipURL = confirmOwnershipFn.addFunctionUrl({
			authType: Lambda.FunctionUrlAuthType.NONE,
		})
	}
}
