import {
	aws_lambda as Lambda,
	aws_logs as CloudWatchLogs,
	RemovalPolicy,
	Resource,
} from 'aws-cdk-lib'
import type { Construct } from 'constructs'

export class LambdaLogGroup extends Resource {
	public constructor(parent: Construct, id: string, lambda: Lambda.IFunction) {
		super(parent, id)
		const isTest = this.node.tryGetContext('isTest') === true
		new CloudWatchLogs.LogGroup(this, 'LogGroup', {
			removalPolicy: isTest ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
			logGroupName: `/aws/lambda/${lambda.functionName}`,
			retention: isTest
				? CloudWatchLogs.RetentionDays.ONE_DAY
				: CloudWatchLogs.RetentionDays.ONE_WEEK,
		})
	}
}
