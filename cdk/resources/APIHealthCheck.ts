import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { aws_lambda as Lambda } from 'aws-cdk-lib'
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

		this.fn = new PackedLambdaFn(this, 'fn', lambdaSources.apiHealthCheck, {
			description: 'Simple health-check resource.',
			layers,
		}).fn
	}
}
