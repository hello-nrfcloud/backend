import { App, CfnOutput, Stack } from 'aws-cdk-lib'
import { CI_STACK_NAME } from './stackConfig.js'
import { ContinuousIntegration } from '../resources/ContinuousIntegration.js'

export class CIStack extends Stack {
	public constructor(
		parent: App,
		{
			repository,
			gitHubOICDProviderArn,
		}: {
			gitHubOICDProviderArn: string
			repository: {
				owner: string
				repo: string
			}
		},
	) {
		super(parent, CI_STACK_NAME)

		const ci = new ContinuousIntegration(this, {
			repository,
			gitHubOICDProviderArn,
		})

		// Outputs
		new CfnOutput(this, 'ciRoleArn', {
			exportName: `${this.stackName}:ciRoleArn`,
			description:
				'Role ARN to use for running continuous integration tests using GitHub Actions',
			value: ci.role.roleArn,
		})
	}
}

export type StackOutputs = {
	ciRoleArn: string
}
