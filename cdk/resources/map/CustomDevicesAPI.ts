import {
	Duration,
	aws_iam as IAM,
	aws_lambda as Lambda,
	aws_ecr as ECR,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { PackedLambda } from '@bifravst/aws-cdk-lambda-helpers'
import { LambdaLogGroup } from '../LambdaLogGroup.js'
import { Scope } from '../../../settings/settings.js'
import { STACK_NAME } from '../../stacks/stackConfig.js'
import type { PublicDevices } from './PublicDevices.js'

export class CustomDevicesAPI extends Construct {
	public readonly createCredentialsURL: Lambda.FunctionUrl
	constructor(
		parent: Construct,
		{
			baseLayer,
			lambdaSources,
			openSSLContainerImage,
			publicDevices,
		}: {
			baseLayer: Lambda.ILayerVersion
			lambdaSources: {
				createCredentials: PackedLambda
				openSSL: PackedLambda
			}
			openSSLContainerImage: {
				repo: ECR.IRepository
				tag: string
			}
			publicDevices: PublicDevices
		},
	) {
		super(parent, 'customDevicesAPI')

		const openSSLFn = new Lambda.Function(this, 'openSSLFn', {
			handler: Lambda.Handler.FROM_IMAGE,
			architecture: Lambda.Architecture.X86_64,
			runtime: Lambda.Runtime.FROM_IMAGE,
			timeout: Duration.seconds(10),
			memorySize: 1792,
			code: Lambda.Code.fromEcrImage(openSSLContainerImage.repo, {
				tagOrDigest: openSSLContainerImage.tag,
				cmd: [lambdaSources.openSSL.handler],
			}),
			description: 'Allows to invoke OpenSSL',
			environment: {
				VERSION: this.node.getContext('version'),
				NODE_NO_WARNINGS: '1',
			},
			...new LambdaLogGroup(this, 'openSSLFnLogs'),
		})

		const createCredentials = new Lambda.Function(this, 'createCredentialsFn', {
			handler: lambdaSources.createCredentials.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(10),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.createCredentials.zipFile),
			description: 'Allows users to create credentials for custom',
			layers: [baseLayer],
			environment: {
				VERSION: this.node.getContext('version'),
				NODE_NO_WARNINGS: '1',
				BACKEND_STACK_NAME: STACK_NAME,
				OPENSSL_LAMBDA_FUNCTION_NAME: openSSLFn.functionName,
				PUBLIC_DEVICES_TABLE_NAME: publicDevices.publicDevicesTable.tableName,
			},
			...new LambdaLogGroup(this, 'createCredentialsFnLogs'),
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['ssm:GetParametersByPath', 'ssm:GetParameter'],
					resources: [
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${STACK_NAME}/${Scope.NRFCLOUD_ACCOUNT_PREFIX}/nordic`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${STACK_NAME}/${Scope.NRFCLOUD_ACCOUNT_PREFIX}/nordic/*`,
					],
				}),
			],
		})
		this.createCredentialsURL = createCredentials.addFunctionUrl({
			authType: Lambda.FunctionUrlAuthType.NONE,
		})
		openSSLFn.grantInvoke(createCredentials)
		publicDevices.publicDevicesTable.grantReadData(createCredentials)
	}
}
