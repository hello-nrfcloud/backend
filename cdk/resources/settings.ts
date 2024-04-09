import { aws_iam as IAM } from 'aws-cdk-lib'

export const Permissions = (stack: {
	stackName: string
	region: string
	account: string
}): IAM.PolicyStatement =>
	new IAM.PolicyStatement({
		actions: ['ssm:GetParametersByPath', 'ssm:GetParameter'],
		resources: [
			`arn:aws:ssm:${stack.region}:${stack.account}:parameter/${stack.stackName}/*`,
		],
	})
