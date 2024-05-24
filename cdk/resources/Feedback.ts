import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { aws_lambda as Lambda } from 'aws-cdk-lib'
import { Duration } from 'aws-cdk-lib'
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

		this.fn = new PackedLambdaFn(this, 'feedbackFn', lambdaSources.feedback, {
			timeout: Duration.seconds(10),
			description: 'Publishes user feedback to teams.',
			layers,
		}).fn
	}
}
