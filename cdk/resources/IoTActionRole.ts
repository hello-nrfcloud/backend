import { aws_iam as IAM, Stack } from 'aws-cdk-lib'
import { Construct } from 'constructs'

/**
 * Base role for IoT Actions that allows to publish to the 'errors' topic
 */
export class IoTActionRole extends Construct {
	public readonly role: IAM.IRole
	public readonly roleArn: string
	constructor(parent: Construct) {
		super(parent, 'errorActionRole')
		this.role = new IAM.Role(this, 'iot-action-role', {
			assumedBy: new IAM.ServicePrincipal(
				'iot.amazonaws.com',
			) as IAM.IPrincipal,
			inlinePolicies: {
				rootPermissions: new IAM.PolicyDocument({
					statements: [
						new IAM.PolicyStatement({
							actions: ['iot:Publish'],
							resources: [
								`arn:aws:iot:${Stack.of(this).region}:${
									Stack.of(this).account
								}:topic/errors`,
							],
						}),
					],
				}),
			},
		})
		this.roleArn = this.role.roleArn
	}
}
