import {
	Duration,
	aws_iam as IAM,
	aws_lambda as Lambda,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { PackedLambda } from '../../helpers/lambdas/packLambda.js'
import { LambdaLogGroup } from '../LambdaLogGroup.js'
import { Scope } from '../../../util/settings.js'

export class CustomDevicesAPI extends Construct {
	public readonly registerURL: Lambda.FunctionUrl
	constructor(
		parent: Construct,
		{
			baseLayer,
			lambdaSources,
		}: {
			baseLayer: Lambda.ILayerVersion
			openSSLLayer: Lambda.ILayerVersion
			lambdaSources: {
				registerCustomDevice: PackedLambda
			}
		},
	) {
		super(parent, 'customDevicesAPI')

		const registerFn = new Lambda.Function(this, 'registerFn', {
			handler: lambdaSources.registerCustomDevice.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(10),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.registerCustomDevice.zipFile),
			description: 'Allows users to register custom devices',
			layers: [baseLayer],
			environment: {
				VERSION: this.node.tryGetContext('version'),
				NODE_NO_WARNINGS: '1',
				STACK_NAME: Stack.of(this).stackName,
			},
			...new LambdaLogGroup(this, 'registerFnLogs'),
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['ssm:GetParametersByPath', 'ssm:GetParameter'],
					resources: [
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/${Scope.NRFCLOUD_ACCOUNT_PREFIX}/nordic`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/${Scope.NRFCLOUD_ACCOUNT_PREFIX}/nordic/*`,
					],
				}),
			],
		})
		this.registerURL = registerFn.addFunctionUrl({
			authType: Lambda.FunctionUrlAuthType.NONE,
		})
	}
}
