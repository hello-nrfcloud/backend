import { LambdaLogGroup } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { Permissions } from '@bifravst/aws-ssm-settings-helpers/cdk'
import { Duration, aws_lambda as Lambda, Stack } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'

export class Feedback extends Construct {
	public readonly fn: Lambda.IFunction

	constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
		}: {
			lambdaSources: Pick<BackendLambdas, 'feedback'>
			layers: Lambda.ILayerVersion[]
		},
	) {
		super(parent, 'feedback')

		this.fn = new Lambda.Function(this, 'feedbackFn', {
			handler: lambdaSources.feedback.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(10),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.feedback.zipFile),
			description: 'Publishes user feedback to teams.',
			layers,
			environment: {
				VERSION: this.node.getContext('version'),
				NODE_NO_WARNINGS: '1',
				STACK_NAME: Stack.of(this).stackName,
				DISABLE_METRICS: this.node.getContext('isTest') === true ? '1' : '0',
			},
			initialPolicy: [Permissions(Stack.of(this))],
			...new LambdaLogGroup(this, 'feedbackFnLogs'),
		})
	}
}
