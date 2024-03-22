import { App, CfnOutput } from 'aws-cdk-lib'
import { WATER_LEVEL_STACKNAME } from './stackConfig.js'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs/index.js'
import path from 'path'
import lambda from 'aws-cdk-lib/aws-lambda'
import {
	Duration,
	aws_events_targets as EventTargets,
	aws_events as Events,
	Stack,
	aws_iam as IAM,
} from 'aws-cdk-lib'
import { ContinuousDeployment } from '../resources/ContinuousDeployment.js'
export class waterLevelStack extends Stack {
	public constructor(
		parent: App,
		{
			repository,
			gitHubOICDProviderArn,
		}: {
			repository: {
				owner: string
				repo: string
			}
			gitHubOICDProviderArn: string
		},
	) {
		super(parent, WATER_LEVEL_STACKNAME)

		// Lambda for mqtt connection
		const getWaterLevels = new NodejsFunction(this, 'getWaterLevels', {
			entry: path.join(
				process.cwd(),
				`./lambda/waterLevel/waterLevelLambda.ts`,
			),
			runtime: lambda.Runtime.NODEJS_20_X,
			handler: 'handler',
			//layers: ,
			timeout: Duration.seconds(30),
			memorySize: 1024,
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['ssm:GetParametersByPath', 'ssm:GetParameter'],
					resources: ['arn:aws:ssm:*:*:parameter/*'],
				}),
			],
		})

		const rule = new Events.Rule(this, 'rule', {
			description: `Rule to schedule waterLevel lambda invocations`,
			schedule: Events.Schedule.rate(Duration.hours(1)),
		})
		rule.addTarget(new EventTargets.LambdaFunction(getWaterLevels))

		const cd = new ContinuousDeployment(this, {
			repository,
			gitHubOICDProviderArn,
		})
		new CfnOutput(this, 'cdRoleArn', {
			exportName: `${this.stackName}:cdRoleArn`,
			description: 'Role ARN to use in the deploy GitHub Actions Workflow',
			value: cd.role.roleArn,
		})
	}
}
