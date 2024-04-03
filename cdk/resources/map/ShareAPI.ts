import {
	Duration,
	aws_lambda as Lambda,
	aws_iam as IAM,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { PackedLambda } from '@bifravst/aws-cdk-lambda-helpers'
import type { PublicDevices } from './PublicDevices.js'
import { LambdaLogGroup } from '../LambdaLogGroup.js'

export class ShareAPI extends Construct {
	public readonly shareURL: Lambda.FunctionUrl
	public readonly confirmOwnershipURL: Lambda.FunctionUrl
	public readonly sharingStatusURL: Lambda.FunctionUrl
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
				sharingStatus: PackedLambda
			}
		},
	) {
		super(parent, 'shareAPI')

		const domain = this.node.getContext('domain')

		const shareFn = new Lambda.Function(this, 'shareFn', {
			handler: lambdaSources.shareDevice.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(10),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.shareDevice.zipFile),
			description: 'Invoked by a user that wants to share a device',
			layers: [baseLayer],
			environment: {
				VERSION: this.node.getContext('version'),
				PUBLIC_DEVICES_TABLE_NAME: publicDevices.publicDevicesTable.tableName,
				FROM_EMAIL: `notification@${domain}`,
				NODE_NO_WARNINGS: '1',
				IS_TEST: this.node.getContext('isTest') === true ? '1' : '0',
			},
			...new LambdaLogGroup(this, 'shareFnLogs'),
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
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(10),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.confirmOwnership.zipFile),
			description:
				'Invoked by a user that wants confirm their device ownership.',
			layers: [baseLayer],
			environment: {
				VERSION: this.node.getContext('version'),
				PUBLIC_DEVICES_TABLE_NAME: publicDevices.publicDevicesTable.tableName,
				NODE_NO_WARNINGS: '1',
			},
			...new LambdaLogGroup(this, 'confirmOwnershipFnLogs'),
		})
		publicDevices.publicDevicesTable.grantReadWriteData(confirmOwnershipFn)
		this.confirmOwnershipURL = confirmOwnershipFn.addFunctionUrl({
			authType: Lambda.FunctionUrlAuthType.NONE,
		})

		const sharingStatusFn = new Lambda.Function(this, 'sharingStatusFn', {
			handler: lambdaSources.sharingStatus.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(10),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.sharingStatus.zipFile),
			description: 'Returns the sharing status of a device.',
			layers: [baseLayer],
			environment: {
				VERSION: this.node.getContext('version'),
				PUBLIC_DEVICES_TABLE_NAME: publicDevices.publicDevicesTable.tableName,
				NODE_NO_WARNINGS: '1',
			},
			...new LambdaLogGroup(this, 'sharingStatusFnLogs'),
		})
		publicDevices.publicDevicesTable.grantReadData(sharingStatusFn)
		this.sharingStatusURL = sharingStatusFn.addFunctionUrl({
			authType: Lambda.FunctionUrlAuthType.NONE,
		})
	}
}
