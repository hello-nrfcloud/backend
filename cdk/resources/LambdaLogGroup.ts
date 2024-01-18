import { Construct } from 'constructs'
import { aws_logs as Logs, Stack } from 'aws-cdk-lib'

export class LambdaLogGroup extends Construct {
	public readonly logGroup: Logs.LogGroup
	constructor(
		parent: Construct,
		id: string,
		retention = Logs.RetentionDays.ONE_DAY,
	) {
		super(parent, id)
		this.logGroup = new Logs.LogGroup(this, 'logGroup', {
			retention,
			logGroupName: `/${Stack.of(this).stackName}/lambda/${id}-${this.node.id}`,
			logGroupClass: Logs.LogGroupClass.INFREQUENT_ACCESS,
		})
	}
}
