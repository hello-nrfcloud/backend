import { Duration, aws_iam as IAM, Stack } from 'aws-cdk-lib'
import { Construct } from 'constructs'

export class ContinuousDeployment extends Construct {
	public readonly role: IAM.IRole
	constructor(
		parent: Construct,
		{
			repository: { owner, repo },
			gitHubOICDProviderArn,
		}: {
			repository: {
				owner: string
				repo: string
			}
			gitHubOICDProviderArn: string
		},
	) {
		super(parent, 'cd')

		const gitHubOIDC = IAM.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
			this,
			'gitHubOICDProvider',
			gitHubOICDProviderArn,
		)

		this.role = new IAM.Role(this, 'ghRole', {
			roleName: `${Stack.of(this).stackName}-cd`,
			assumedBy: new IAM.WebIdentityPrincipal(
				gitHubOIDC.openIdConnectProviderArn,
				{
					StringEquals: {
						[`token.actions.githubusercontent.com:sub`]: `repo:${owner}/${repo}:environment:production`,
						[`token.actions.githubusercontent.com:aud`]: 'sts.amazonaws.com',
					},
				},
			),
			description: `This role is used by GitHub Actions to deploy ${
				Stack.of(this).stackName
			}`,
			maxSessionDuration: Duration.hours(1),
			managedPolicies: [
				IAM.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
			],
		})
	}
}
