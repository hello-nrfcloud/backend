import { LambdaLogGroup } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { Duration, aws_lambda as Lambda } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'

/**
 * API health check
 */
export class APIHealthCheck extends Construct {
	public readonly fn: Lambda.IFunction
	constructor(
		parent: Construct,
		{
			layers,
			lambdaSources,
		}: {
			layers: Array<Lambda.ILayerVersion>
			lambdaSources: Pick<BackendLambdas, 'apiHealthCheck'>
		},
	) {
		super(parent, 'api-health-check')

		this.fn = new Lambda.Function(this, 'fn', {
			handler: lambdaSources.apiHealthCheck.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(1),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.apiHealthCheck.zipFile),
			description: 'Simple health-check resource.',
			layers,
			environment: {
				VERSION: this.node.getContext('version'),
				DISABLE_METRICS: this.node.getContext('isTest') === true ? '1' : '0',
			},
			...new LambdaLogGroup(this, 'fnLogs'),
		})
	}
}
