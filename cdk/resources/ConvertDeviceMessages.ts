import {
	IoTActionRole,
	PackedLambdaFn,
} from '@bifravst/aws-cdk-lambda-helpers/cdk'
import {
	aws_iam as IAM,
	aws_iot as IoT,
	type aws_lambda as Lambda,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'

/**
 * Resources needed to convert messages sent by nRF Cloud to the format that hello.nrfcloud.com expects
 */
export class ConvertNrfCloudDeviceMessages extends Construct {
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
		}: {
			lambdaSources: Pick<BackendLambdas, 'onNrfCloudDeviceMessage'>
			layers: Lambda.ILayerVersion[]
		},
	) {
		super(parent, 'converter')

		const onNrfCloudDeviceMessage = new PackedLambdaFn(
			this,
			'onNrfCloudDeviceMessage',
			lambdaSources.onNrfCloudDeviceMessage,
			{
				description: `Convert device messages and republish as SenML`,
				layers,
				initialPolicy: [
					new IAM.PolicyStatement({
						actions: ['iot:UpdateThingShadow'],
						resources: ['*'],
					}),
				],
			},
		)

		const rule = new IoT.CfnTopicRule(this, 'topicRule', {
			topicRulePayload: {
				description: `Convert device messages published using the nRF Cloud Library to LwM2M and store in the shadow`,
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: `
					SELECT
					    * as message,
						topic(4) as deviceId,
						timestamp() as timestamp,
						topic() as topic
					FROM 'data/+/+/+/+'
					WHERE messageType = 'DATA'
					AND appId = 'GNSS'
					AND isUndefined(data) = False
				`,
				actions: [
					{
						lambda: {
							functionArn: onNrfCloudDeviceMessage.fn.functionArn,
						},
					},
				],
				errorAction: {
					republish: {
						roleArn: new IoTActionRole(this).roleArn,
						topic: 'errors',
					},
				},
			},
		})

		onNrfCloudDeviceMessage.fn.addPermission('topicRule', {
			principal: new IAM.ServicePrincipal('iot.amazonaws.com'),
			sourceArn: rule.attrArn,
		})
	}
}
